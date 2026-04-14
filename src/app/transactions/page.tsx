"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { createTransactionHash, formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import type { Account, Category, Label, TransactionWithRelations } from "@/lib/database.types";

const PAGE_SIZE = 20;

export default function TransactionsPage() {
  type TransactionFilterType = "" | "income" | "expense" | "transfer";
  const searchParams = useSearchParams();
  const accountParam = searchParams.get("account") ?? "";

  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filterAccount, setFilterAccount] = useState(accountParam);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState<TransactionFilterType>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(Boolean(accountParam));
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState("");

  // Form
  const [form, setForm] = useState({
    account_id: "",
    category_id: "",
    type: "expense" as "income" | "expense" | "transfer",
    amount: "",
    description: "",
    notes: "",
    date: new Date().toISOString().split("T")[0],
    label_ids: [] as string[],
    transfer_to_account_id: "",
  });

  const loadTransactions = useCallback(async () => {
    setLoadError("");

    let query = supabase
      .from("transactions")
      .select(
        "*, categories(*), accounts:accounts!transactions_account_id_fkey(*), transaction_labels(labels(*))",
        { count: "exact" }
      )
      .order("date", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterAccount) {
      query = query.or(`account_id.eq.${filterAccount},transfer_to_account_id.eq.${filterAccount}`);
    }
    if (filterCategory) query = query.eq("category_id", filterCategory);
    if (filterType) query = query.eq("type", filterType);
    if (filterDateFrom) query = query.gte("date", filterDateFrom);
    if (filterDateTo) query = query.lte("date", filterDateTo);

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to load transactions", error);
      setTransactions([]);
      setTotalCount(0);
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    if (data) setTransactions(data as unknown as TransactionWithRelations[]);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [page, filterAccount, filterCategory, filterType, filterDateFrom, filterDateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    async function loadRefs() {
      const [{ data: accts }, { data: cats }, { data: lbls }] = await Promise.all([
        supabase.from("accounts").select("*").order("name"),
        supabase.from("categories").select("*").order("name"),
        supabase.from("labels").select("*").order("name"),
      ]);
      if (accts) setAccounts(accts);
      if (cats) setCategories(cats);
      if (lbls) setLabels(lbls);
    }
    loadRefs();
  }, []);

  function openCreate() {
    setEditing(null);
    setFormError("");
    setForm({
      account_id: accounts[0]?.id ?? "",
      category_id: "",
      type: "expense",
      amount: "",
      description: "",
      notes: "",
      date: new Date().toISOString().split("T")[0],
      label_ids: [],
      transfer_to_account_id: "",
    });
    setModalOpen(true);
  }

  function openEdit(tx: TransactionWithRelations) {
    setEditing(tx);
    setFormError("");
    setForm({
      account_id: tx.account_id,
      category_id: tx.category_id ?? "",
      type: tx.type,
      amount: String(tx.amount),
      description: tx.description ?? "",
      notes: tx.notes ?? "",
      date: tx.date,
      label_ids: tx.transaction_labels?.map((tl) => tl.labels.id) ?? [],
      transfer_to_account_id: tx.transfer_to_account_id ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const amount = parseFloat(form.amount);
    if (!amount || !form.account_id) return;

    const payload = {
        account_id: form.account_id,
        category_id: form.category_id || null,
        type: form.type,
        amount,
        description: form.description || null,
        notes: form.notes || null,
        date: form.date,
        transaction_hash: createTransactionHash({
          date: form.date,
          type: form.type,
          amount,
          description: form.description,
        }),
        transfer_to_account_id: form.type === "transfer" ? (form.transfer_to_account_id || null) : null,
      };

    const transactionResponse = editing
      ? await supabase
          .from("transactions")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single()
      : await supabase
          .from("transactions")
          .insert(payload)
          .select()
          .single();

    if (transactionResponse.error) {
      setFormError(
        transactionResponse.error.code === "23505"
          ? "A matching transaction already exists for this account."
          : transactionResponse.error.message
      );
      return;
    }

    const inserted = transactionResponse.data;

    if (editing) {
      await supabase.from("transaction_labels").delete().eq("transaction_id", editing.id);
    }

    if (inserted && form.label_ids.length > 0) {
      const { error } = await supabase.from("transaction_labels").insert(
        form.label_ids.map((lid) => ({
          transaction_id: inserted.id,
          label_id: lid,
        }))
      );

      if (error) {
        setFormError(error.message);
        return;
      }
    }

    setModalOpen(false);
    loadTransactions();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this transaction?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    loadTransactions();
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const filteredCategories = categories.filter(
    (c) => c.type === form.type || form.type === "transfer"
  );

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Filter size={16} />
            Filters
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Account</label>
              <select
                value={filterAccount}
                onChange={(e) => { setFilterAccount(e.target.value); setPage(0); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
              <select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as TransactionFilterType);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Transactions Table */}
      <Card className="overflow-x-auto p-0!">
        {loadError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load transactions: {loadError}
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Labels</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{tx.description || "—"}</p>
                    {tx.notes && (
                      <p className="text-xs text-gray-400">{tx.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: tx.accounts?.color }}
                      />
                      <span className="text-gray-600">{tx.accounts?.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {tx.categories ? (
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: tx.categories.color + "20",
                          color: tx.categories.color,
                        }}
                      >
                        {tx.categories.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {tx.transaction_labels?.map((tl) => (
                        <span
                          key={tl.labels.id}
                          className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: tl.labels.color + "20",
                            color: tl.labels.color,
                          }}
                        >
                          {tl.labels.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <span
                      className={
                        tx.type === "income"
                          ? "text-green-600"
                          : tx.type === "expense"
                          ? "text-red-600"
                          : "text-blue-600"
                      }
                    >
                      {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                      {formatCurrency(Number(tx.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(tx)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Transaction" : "New Transaction"}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {(["expense", "income", "transfer"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t, category_id: "" })}
                className={`rounded-lg border-2 px-3 py-2 text-sm font-medium capitalize ${
                  form.type === t
                    ? t === "income"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : t === "expense"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount (€)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Account</label>
            <select
              required
              value={form.account_id}
              onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {form.type === "transfer" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Transfer To</label>
              <select
                value={form.transfer_to_account_id}
                onChange={(e) => setForm({ ...form, transfer_to_account_id: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select destination</option>
                {accounts.filter((a) => a.id !== form.account_id).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">None</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., Supermarket groceries"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Labels</label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => {
                    const ids = form.label_ids.includes(label.id)
                      ? form.label_ids.filter((id) => id !== label.id)
                      : [...form.label_ids, label.id];
                    setForm({ ...form, label_ids: ids });
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    form.label_ids.includes(label.id)
                      ? "text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={
                    form.label_ids.includes(label.id)
                      ? { backgroundColor: label.color }
                      : undefined
                  }
                >
                  {label.name}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
