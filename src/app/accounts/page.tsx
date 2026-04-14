"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { formatCurrency } from "@/lib/utils";
import { format, startOfMonth, subMonths } from "date-fns";
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

const MONTH_COUNT = 6;

type AccountHistoryRow = {
  account_id: string;
  transfer_to_account_id: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
};

type AccountTrendPoint = {
  label: string;
  balance: number;
};

function buildAccountTrends(accounts: Account[], transactions: AccountHistoryRow[]) {
  const months = Array.from({ length: MONTH_COUNT }, (_, index) => {
    const monthDate = subMonths(new Date(), MONTH_COUNT - index - 1);

    return {
      key: format(monthDate, "yyyy-MM"),
      label: format(monthDate, "MMM"),
    };
  });

  const monthIndexByKey = new Map(months.map((month, index) => [month.key, index]));
  const monthlyNetByAccount = new Map(
    accounts.map((account) => [account.id, Array.from({ length: MONTH_COUNT }, () => 0)])
  );

  for (const transaction of transactions) {
    const monthIndex = monthIndexByKey.get(transaction.date.slice(0, 7));

    if (monthIndex === undefined) {
      continue;
    }

    const amount = Number(transaction.amount);

    if (monthlyNetByAccount.has(transaction.account_id)) {
      const sourceSeries = monthlyNetByAccount.get(transaction.account_id);

      if (sourceSeries) {
        sourceSeries[monthIndex] += transaction.type === "income" ? amount : -amount;
      }
    }

    if (
      transaction.type === "transfer" &&
      transaction.transfer_to_account_id &&
      monthlyNetByAccount.has(transaction.transfer_to_account_id)
    ) {
      const destinationSeries = monthlyNetByAccount.get(transaction.transfer_to_account_id);

      if (destinationSeries) {
        destinationSeries[monthIndex] += amount;
      }
    }
  }

  return Object.fromEntries(
    accounts.map((account) => {
      const monthlyNet = monthlyNetByAccount.get(account.id) ?? [];
      const startingBalance =
        Number(account.current_balance) - monthlyNet.reduce((sum, value) => sum + value, 0);
      let runningBalance = startingBalance;

      return [
        account.id,
        months.map((month, index) => {
          runningBalance += monthlyNet[index] ?? 0;

          return {
            label: month.label,
            balance: Number(runningBalance.toFixed(2)),
          } satisfies AccountTrendPoint;
        }),
      ];
    })
  ) as Record<string, AccountTrendPoint[]>;
}

function AccountTrendSparkline({
  points,
  color,
}: {
  points: AccountTrendPoint[];
  color: string;
}) {
  if (points.length === 0) {
    return <div className="h-14 rounded-lg bg-gray-50" />;
  }

  const width = 180;
  const height = 56;
  const padding = 5;
  const values = points.map((point) => point.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coordinates = points.map((point, index) => {
    const x = padding + index * stepX;
    const normalized = range === 0 ? 0.5 : (point.balance - min) / range;
    const y = height - padding - normalized * (height - padding * 2);

    return [x, y] as const;
  });

  const polylinePoints = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPoints = [
    `${padding},${height - padding}`,
    polylinePoints,
    `${width - padding},${height - padding}`,
  ].join(" ");
  const delta = points.at(-1)!.balance - points[0]!.balance;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-gray-400">
        <span>6M Evolution</span>
        <span>{points[0]?.label} - {points.at(-1)?.label}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full overflow-visible">
        <polyline
          points={areaPoints}
          fill={color}
          fillOpacity="0.12"
          stroke="none"
        />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coordinates.map(([x, y], index) => (
          <circle
            key={`${points[index]?.label}-${x}`}
            cx={x}
            cy={y}
            r={index === coordinates.length - 1 ? 3.5 : 2.5}
            fill={index === coordinates.length - 1 ? color : "white"}
            stroke={color}
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Click to view transactions</span>
        <span className={delta >= 0 ? "font-medium text-green-600" : "font-medium text-red-600"}>
          {delta >= 0 ? "+" : ""}
          {formatCurrency(delta)}
        </span>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountTrends, setAccountTrends] = useState<Record<string, AccountTrendPoint[]>>({});
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
    const periodStart = startOfMonth(subMonths(new Date(), MONTH_COUNT - 1))
      .toISOString()
      .split("T")[0];

    const [{ data: accountRows }, { data: transactionRows }] = await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .order("name"),
      supabase
        .from("transactions")
        .select("account_id, transfer_to_account_id, type, amount, date")
        .gte("date", periodStart),
    ]);

    if (accountRows) {
      const typedAccounts = accountRows as Account[];
      setAccounts(typedAccounts);
      setAccountTrends(buildAccountTrends(typedAccounts, (transactionRows ?? []) as AccountHistoryRow[]));
    }

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

  function openTransactionsForAccount(accountId: string) {
    router.push(`/transactions?account=${accountId}`);
  }

  function stopCardNavigation(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
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
          <Card
            key={account.id}
            role="link"
            tabIndex={0}
            onClick={() => openTransactionsForAccount(account.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openTransactionsForAccount(account.id);
              }
            }}
            className={`cursor-pointer transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              !account.is_active ? "opacity-50" : ""
            }`}
          >
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
                  onClick={(event) => {
                    stopCardNavigation(event);
                    openEdit(account);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(event) => {
                    stopCardNavigation(event);
                    handleDelete(account.id);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
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

            <div className="mt-4">
              <AccountTrendSparkline
                points={accountTrends[account.id] ?? []}
                color={account.color}
              />
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                onClick={(event) => {
                  stopCardNavigation(event);
                  toggleActive(account);
                }}
                onKeyDown={(event) => event.stopPropagation()}
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
