"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Label } from "@/lib/database.types";

const COLORS = [
  "#1A1C1E", "#6C7278", "#B8422E", "#3F6B4E", "#A86E2A",
  "#3A4F66", "#8C5A3C", "#4F4A45", "#7A8C7E", "#5C2E1F",
  "#94704A", "#2E3B4E", "#6B5944",
];

export default function LabelsPage() {
  const { user } = useAuth();
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Label | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [form, setForm] = useState({ name: "", color: COLORS[5] });

  async function loadLabels() {
    setLoading(true);
    setPageError("");

    const { data, error } = await supabase.from("labels").select("*").order("name");

    if (error) {
      setLabels([]);
      setPageError(error.message);
      setLoading(false);
      return;
    }

    if (data) setLabels(data);
    setLoading(false);
  }

  useEffect(() => {
    void loadLabels();
  }, []);

  function openCreate() {
    setEditing(null);
    setFormError("");
    setForm({ name: "", color: COLORS[5] });
    setModalOpen(true);
  }

  function openEdit(label: Label) {
    setEditing(label);
    setFormError("");
    setForm({ name: label.name, color: label.color });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!user) {
      setFormError("Sign in again before editing labels.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      color: form.color,
    };

    if (!payload.name) {
      setFormError("Name is required.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editing?.user_id === null) {
        const { data: createdLabel, error: insertError } = await supabase
          .from("labels")
          .insert({
            ...payload,
            user_id: user.id,
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        const { data: linkedTransactions, error: linkedTransactionsError } = await supabase
          .from("transaction_labels")
          .select("transaction_id")
          .eq("label_id", editing.id);

        if (linkedTransactionsError) {
          throw linkedTransactionsError;
        }

        const transactionIds = (linkedTransactions ?? []).map((item) => item.transaction_id);

        if (transactionIds.length > 0) {
          const { error: deleteError } = await supabase
            .from("transaction_labels")
            .delete()
            .eq("label_id", editing.id);

          if (deleteError) {
            throw deleteError;
          }

          const { error: insertLinkedError } = await supabase.from("transaction_labels").insert(
            transactionIds.map((transactionId) => ({
              transaction_id: transactionId,
              label_id: createdLabel.id,
            }))
          );

          if (insertLinkedError) {
            throw insertLinkedError;
          }
        }
      } else if (editing) {
        const { error } = await supabase
          .from("labels")
          .update(payload)
          .eq("id", editing.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("labels").insert({
          ...payload,
          user_id: user.id,
        });

        if (error) {
          throw error;
        }
      }

      setModalOpen(false);
      setEditing(null);
      await loadLabels();
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        setFormError("You already have a label with that name.");
      } else if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError("The label could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this label?")) return;

    const label = labels.find((item) => item.id === id);

    if (label?.user_id === null) {
      setPageError("Shared default labels cannot be deleted.");
      return;
    }

    const { error } = await supabase.from("labels").delete().eq("id", id);

    if (error) {
      setPageError(error.message);
      return;
    }

    await loadLabels();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-tertiary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-label text-[11px] text-[var(--color-secondary)]">Tags</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-primary)] sm:text-3xl">Labels</h1>
        </div>
        <button onClick={openCreate} className="btn btn-primary">
          <Plus size={16} />
          Add Label
        </button>
      </div>

      {pageError && <div className="notice notice-danger">{pageError}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {labels.map((label) => (
          <Card key={label.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-4 w-4 flex-none rounded-full" style={{ backgroundColor: label.color }} />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--color-primary)]">
                    {label.name}
                  </span>
                  {label.user_id === null && (
                    <p className="text-xs text-[var(--color-secondary)]">Default label</p>
                  )}
                </div>
              </div>
              <div className="flex flex-none gap-1">
                <button
                  onClick={() => openEdit(label)}
                  aria-label="Edit label"
                  className="btn btn-ghost px-2 py-1.5"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(label.id)}
                  aria-label="Delete label"
                  className="btn btn-ghost px-2 py-1.5 hover:!text-[var(--color-danger)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {labels.length === 0 && (
        <Card>
          <div className="py-12 text-center text-sm text-[var(--color-secondary)]">
            No labels yet. Create your first one!
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Label" : "New Label"}>
        <form onSubmit={handleSave} className="space-y-4">
          {editing?.user_id === null && (
            <div className="notice notice-warning">
              This is a shared default label. Saving will create your own copy and reassign your
              transaction label links to it.
            </div>
          )}

          {formError && <div className="notice notice-danger">{formError}</div>}

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="field"
            />
          </div>
          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    form.color === c ? "border-[var(--color-primary)]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
