"use client";

import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { LabelMultiSelect } from "@/components/LabelMultiSelect";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import type {
  Category,
  Label,
  SplitChildPayload,
  TransactionWithRelations,
} from "@/lib/database.types";

type Row = {
  category_id: string;
  amount: string;
  description: string;
  label_ids: string[];
};

interface SplitModalProps {
  open: boolean;
  onClose: () => void;
  transaction: TransactionWithRelations | null;
  categories: Category[];
  labels: Label[];
  onSaved: () => void;
}

function emptyRow(): Row {
  return { category_id: "", amount: "", description: "", label_ids: [] };
}

export function SplitModal({
  open,
  onClose,
  transaction,
  categories,
  labels,
  onSaved,
}: SplitModalProps) {
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fieldId = useId();

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === transaction?.type),
    [categories, transaction?.type]
  );

  const total = transaction ? Number(transaction.amount) : 0;
  const assigned = rows.reduce((sum, row) => {
    const value = parseFloat(row.amount);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const remaining = +(total - assigned).toFixed(2);
  const balanced = Math.abs(remaining) < 0.01;

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  }

  function distributeRemaining(index: number) {
    if (Math.abs(remaining) < 0.01) return;
    const current = parseFloat(rows[index].amount) || 0;
    updateRow(index, { amount: (current + remaining).toFixed(2) });
  }

  async function handleSave() {
    if (!transaction || saving) return;
    setError("");

    if (rows.length < 2) {
      setError("Add at least two splits.");
      return;
    }

    const cleaned: SplitChildPayload[] = [];
    for (const [i, row] of rows.entries()) {
      const value = parseFloat(row.amount);
      if (!Number.isFinite(value) || value <= 0) {
        setError(`Split ${i + 1}: enter an amount greater than zero.`);
        document.getElementById(`${fieldId}-amount-${i}`)?.focus();
        return;
      }
      cleaned.push({
        amount: +value.toFixed(2),
        category_id: row.category_id || null,
        description: row.description.trim() || null,
        label_ids: row.label_ids,
      });
    }

    if (!balanced) {
      setError(
        `Splits sum to ${formatCurrency(assigned)} but the transaction is ${formatCurrency(total)}. Adjust the amounts or use “Fill Rest”.`
      );
      return;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc("split_transaction", {
      p_parent_id: transaction.id,
      p_children: cleaned,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    onSaved();
    onClose();
  }

  async function handleUnsplit() {
    if (!transaction) return;
    if (!confirm("Remove this split? The original transaction stays intact.")) return;
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("unsplit_transaction", {
      p_parent_id: transaction.id,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSaved();
    onClose();
  }

  if (!transaction) return null;

  return (
    <Modal open={open} onClose={onClose} title="Split Transaction" size="lg" mobileSheet bodyClassName="p-0">
      <div className="flex h-full flex-col bg-[var(--color-neutral)]">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
          <section className="surface-card rounded-md p-4 sm:p-5">
            <p className="label-caps">Original transaction</p>
            <p className="mt-1 truncate text-base font-semibold text-[var(--color-primary)]">
              {transaction.description || "Untitled"}
            </p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="text-sm text-[var(--color-secondary)]">Total</span>
              <span className="stat-value text-[var(--color-primary)]">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--color-border)] pt-2">
              <span className="text-sm text-[var(--color-secondary)]">Remaining</span>
              <span
                className={`text-lg font-semibold ${
                  balanced
                    ? "text-[var(--color-success)]"
                    : remaining > 0
                      ? "text-[var(--color-info)]"
                      : "text-[var(--color-danger)]"
                }`}
              >
                {formatCurrency(remaining)}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--color-secondary)]">
              Children inherit the date, account and type of the parent. The parent stays as the
              bank-reconciliation record; dashboards aggregate the children.
            </p>
          </section>

          <section className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="surface-card space-y-3 rounded-md p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-caps">
                    Split {index + 1}
                  </span>
                  <div className="-mr-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => distributeRemaining(index)}
                      disabled={balanced}
                      className="btn btn-ghost btn-sm"
                      title="Assign remaining amount here"
                    >
                      Fill Rest
                    </button>
                    {rows.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove split ${index + 1}`}
                        className="btn btn-ghost btn-icon hover:text-[var(--color-danger)]"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label htmlFor={`${fieldId}-category-${index}`} className="field-label">
                      Category
                    </label>
                    <select
                      id={`${fieldId}-category-${index}`}
                      value={row.category_id}
                      onChange={(e) => updateRow(index, { category_id: e.target.value })}
                      className="field"
                    >
                      <option value="">Uncategorized</option>
                      {filteredCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`${fieldId}-amount-${index}`} className="field-label">
                      Amount
                    </label>
                    <div className="relative">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-secondary)]"
                      >
                        €
                      </span>
                      <input
                        id={`${fieldId}-amount-${index}`}
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        autoComplete="off"
                        value={row.amount}
                        onChange={(e) => updateRow(index, { amount: e.target.value })}
                        className="field pl-7 text-right font-semibold tabular-nums"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor={`${fieldId}-description-${index}`} className="field-label">
                    Description (optional)
                  </label>
                  <input
                    id={`${fieldId}-description-${index}`}
                    type="text"
                    autoComplete="off"
                    value={row.description}
                    onChange={(e) => updateRow(index, { description: e.target.value })}
                    className="field"
                    placeholder="What was this part of the charge?"
                  />
                </div>

                <div>
                  <p id={`${fieldId}-labels-${index}`} className="field-label">
                    Labels
                  </p>
                  <LabelMultiSelect
                    labels={labels}
                    selectedIds={row.label_ids}
                    onChange={(ids) => updateRow(index, { label_ids: ids })}
                    labelledBy={`${fieldId}-labels-${index}`}
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addRow}
              className="btn btn-secondary w-full"
            >
              <Plus size={16} aria-hidden />
              Add Another Split
            </button>
          </section>

          {error && (
            <div role="alert" className="notice notice-danger">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {transaction.is_split ? (
              <button
                type="button"
                onClick={handleUnsplit}
                disabled={saving}
                className="btn btn-danger-outline"
              >
                Remove Split
              </button>
            ) : (
              <div />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={onClose} className="btn btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? "Saving…" : "Save Split"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
