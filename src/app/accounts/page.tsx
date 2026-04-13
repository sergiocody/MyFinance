"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Account } from "@/lib/database.types";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
] as const;

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#0ea5e9",
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "checking" as Account["type"],
    bank_name: "",
    initial_balance: "0",
    color: "#3b82f6",
    currency: "EUR",
  });

  async function loadAccounts() {
    setLoading(true);
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .order("name");
    if (data) setAccounts(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      type: "checking",
      bank_name: "",
      initial_balance: "0",
      color: "#3b82f6",
      currency: "EUR",
    });
    setModalOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({
      name: account.name,
      type: account.type,
      bank_name: account.bank_name ?? "",
      initial_balance: String(account.initial_balance),
      color: account.color,
      currency: account.currency,
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseFloat(form.initial_balance) || 0;

    if (editing) {
      await supabase
        .from("accounts")
        .update({
          name: form.name,
          type: form.type,
          bank_name: form.bank_name || null,
          color: form.color,
          currency: form.currency,
        })
        .eq("id", editing.id);
    } else {
      await supabase.from("accounts").insert({
        name: form.name,
        type: form.type,
        bank_name: form.bank_name || null,
        initial_balance: balance,
        current_balance: balance,
        color: form.color,
        currency: form.currency,
      });
    }
    setModalOpen(false);
    loadAccounts();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account and all its transactions?")) return;
    await supabase.from("accounts").delete().eq("id", id);
    loadAccounts();
  }

  async function toggleActive(account: Account) {
    await supabase
      .from("accounts")
      .update({ is_active: !account.is_active })
      .eq("id", account.id);
    loadAccounts();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={16} />
          Add Account
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id} className={!account.is_active ? "opacity-50" : ""}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: account.color }}
                />
                <div>
                  <h3 className="font-semibold text-gray-900">{account.name}</h3>
                  <p className="text-xs text-gray-500">
                    {account.bank_name && `${account.bank_name} · `}
                    {ACCOUNT_TYPES.find((t) => t.value === account.type)?.label}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(account)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs text-gray-500">Current Balance</p>
              <p className={`text-xl font-bold ${Number(account.current_balance) >= 0 ? "text-gray-900" : "text-red-600"}`}>
                {formatCurrency(Number(account.current_balance), account.currency)}
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Initial: {formatCurrency(Number(account.initial_balance), account.currency)}
              </p>
              <button
                onClick={() => toggleActive(account)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  account.is_active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {account.is_active ? "Active" : "Inactive"}
              </button>
            </div>
          </Card>
        ))}
      </div>

      {accounts.length === 0 && (
        <Card>
          <div className="py-12 text-center">
            <p className="text-gray-500">No accounts yet. Create your first one!</p>
          </div>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Account" : "New Account"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., Main Checking"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bank Name</label>
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., ING, BBVA"
            />
          </div>

          {!editing && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Initial Balance (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-6 w-6 rounded-full border-2 ${
                    form.color === c ? "border-gray-900" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

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
