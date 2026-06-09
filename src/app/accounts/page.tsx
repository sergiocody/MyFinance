"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { formatCurrency } from "@/lib/utils";
import { format, startOfMonth, subMonths } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Link2,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Account, BankConnection } from "@/lib/database.types";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
] as const;

const COLORS = [
  "#1A1C1E", "#6C7278", "#B8422E", "#3F6B4E", "#A86E2A",
  "#3A4F66", "#8C5A3C", "#4F4A45", "#7A8C7E", "#5C2E1F",
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
    return <div className="h-14 rounded-sm bg-[rgba(26,28,30,0.04)]" />;
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
      <div className="font-label flex items-center justify-between text-[10px] text-[var(--color-secondary)]">
        <span>6M Evolution</span>
        <span>{points[0]?.label} - {points.at(-1)?.label}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full overflow-visible">
        <polyline points={areaPoints} fill={color} fillOpacity="0.12" stroke="none" />
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
        <span className="text-[var(--color-secondary)]">Click to view transactions</span>
        <span className={`font-medium ${delta >= 0 ? "amount-pos" : "amount-neg"}`}>
          {delta >= 0 ? "+" : ""}
          {formatCurrency(delta)}
        </span>
      </div>
    </div>
  );
}

const COUNTRIES = [
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "IT", label: "Italy" },
  { code: "IE", label: "Ireland" },
  { code: "PT", label: "Portugal" },
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Belgium" },
];

type Institution = {
  id: string;
  name: string;
  country: string;
  logo: string;
  bic: string | null;
};

function BankConnectFlow({
  accountId,
  onClose,
}: {
  accountId: string | null;
  onClose: () => void;
}) {
  const [country, setCountry] = useState("ES");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [search, setSearch] = useState("");

  async function loadInstitutions(countryCode: string) {
    setLoadingInstitutions(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/banking/institutions?country=${countryCode}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const { institutions: data } = await res.json();
        setInstitutions(data ?? []);
      }
    } finally {
      setLoadingInstitutions(false);
    }
  }

  useEffect(() => {
    if (accountId) {
      loadInstitutions(country);
    }
  }, [accountId, country]);

  async function handleSelectInstitution(institution: Institution) {
    if (!accountId) return;
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/banking/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          accountId,
          aspspName: institution.name,
          aspspCountry: institution.country,
        }),
      });

      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const { error } = await res.json();
        alert(`Connection failed: ${error}`);
      }
    } finally {
      setConnecting(false);
    }
  }

  const filtered = institutions.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
          Country
        </label>
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setSearch("");
          }}
          className="field"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <input
          type="text"
          placeholder="Search banks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field"
        />
      </div>

      {loadingInstitutions ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-tertiary)] border-t-transparent" />
        </div>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.map((inst) => (
            <button
              key={inst.id}
              onClick={() => handleSelectInstitution(inst)}
              disabled={connecting}
              className="flex w-full items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-sm transition hover:bg-[rgba(26,28,30,0.04)] disabled:opacity-50"
            >
              {inst.logo && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={inst.logo} alt="" className="h-6 w-6 rounded-sm object-contain" />
              )}
              <span className="font-medium text-[var(--color-primary)]">{inst.name}</span>
            </button>
          ))}
          {filtered.length === 0 && !loadingInstitutions && (
            <p className="py-4 text-center text-sm text-[var(--color-secondary)]">No banks found</p>
          )}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankConnections, setBankConnections] = useState<Record<string, BankConnection>>({});
  const [accountTrends, setAccountTrends] = useState<Record<string, AccountTrendPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectAccountId, setConnectAccountId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ account: Account; txCount: number } | null>(null);
  const [migrateTarget, setMigrateTarget] = useState<string>("");
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "checking" as Account["type"],
    bank_name: "",
    iban: "",
    initial_balance: "0",
    color: COLORS[5],
    currency: "EUR",
    account_mode: "manual" as "manual" | "automated",
    account_class: "standard" as "standard" | "remunerated" | "investment",
    parent_account_id: "" as string,
  });

  async function loadAccounts() {
    setLoading(true);
    const periodStart = startOfMonth(subMonths(new Date(), MONTH_COUNT - 1))
      .toISOString()
      .split("T")[0];

    const [{ data: accountRows }, { data: transactionRows }, { data: connectionRows }] = await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase
        .from("transactions")
        .select("account_id, transfer_to_account_id, type, amount, date")
        .gte("date", periodStart),
      supabase.from("bank_connections").select("*"),
    ]);

    if (accountRows) {
      const typedAccounts = accountRows as Account[];
      setAccounts(typedAccounts);
      setAccountTrends(buildAccountTrends(typedAccounts, (transactionRows ?? []) as AccountHistoryRow[]));
    }

    if (connectionRows) {
      const connMap: Record<string, BankConnection> = {};
      for (const conn of connectionRows as BankConnection[]) {
        connMap[conn.account_id] = conn;
      }
      setBankConnections(connMap);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      type: "checking",
      bank_name: "",
      iban: "",
      initial_balance: "0",
      color: COLORS[5],
      currency: "EUR",
      account_mode: "manual",
      account_class: "standard",
      parent_account_id: "",
    });
    setModalOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({
      name: account.name,
      type: account.type,
      bank_name: account.bank_name ?? "",
      iban: account.iban ?? "",
      initial_balance: String(account.initial_balance),
      color: account.color,
      currency: account.currency,
      account_mode: account.account_mode,
      account_class: account.account_class,
      parent_account_id: account.parent_account_id ?? "",
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
          iban: form.iban.trim() || null,
          color: form.color,
          currency: form.currency,
          account_class: form.account_class,
          parent_account_id: form.parent_account_id || null,
        })
        .eq("id", editing.id);
    } else {
      await supabase.from("accounts").insert({
        name: form.name,
        type: form.type,
        bank_name: form.bank_name || null,
        iban: form.iban.trim() || null,
        initial_balance: form.account_mode === "manual" ? balance : 0,
        current_balance: form.account_mode === "manual" ? balance : 0,
        color: form.color,
        currency: form.currency,
        account_mode: form.account_mode,
        account_class: form.account_class,
        parent_account_id: form.parent_account_id || null,
      });
    }
    setModalOpen(false);
    loadAccounts();
  }

  async function handleDelete(id: string) {
    const account = accounts.find(a => a.id === id);
    if (!account) return;

    const { count } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .or(`account_id.eq.${id},transfer_to_account_id.eq.${id}`);

    if (count && count > 0) {
      setDeleteModal({ account, txCount: count });
      setMigrateTarget("");
    } else {
      if (!confirm("Delete this empty account?")) return;
      await supabase.from("bank_connections").delete().eq("account_id", id);
      await supabase.from("imports").update({ account_id: null }).eq("account_id", id);
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) {
        showToast("error", `Failed to delete: ${error.message}`);
      } else {
        showToast("success", "Account deleted");
      }
      loadAccounts();
    }
  }

  async function confirmDeleteWithMigration() {
    if (!deleteModal || !migrateTarget) return;
    const sourceId = deleteModal.account.id;

    await supabase
      .from("transactions")
      .update({ account_id: migrateTarget })
      .eq("account_id", sourceId);

    await supabase
      .from("transactions")
      .update({ transfer_to_account_id: migrateTarget })
      .eq("transfer_to_account_id", sourceId);

    await supabase.from("bank_connections").delete().eq("account_id", sourceId);
    await supabase.from("imports").update({ account_id: null }).eq("account_id", sourceId);
    await supabase.from("accounts").delete().eq("id", sourceId);

    setDeleteModal(null);
    showToast("success", `Account deleted. ${deleteModal.txCount} transactions moved.`);
    loadAccounts();
  }

  async function confirmDeleteAll() {
    if (!deleteModal) return;
    const sourceId = deleteModal.account.id;

    await supabase
      .from("transactions")
      .update({ transfer_to_account_id: null })
      .eq("transfer_to_account_id", sourceId);

    await supabase.from("imports").update({ account_id: null }).eq("account_id", sourceId);

    const { error } = await supabase.from("accounts").delete().eq("id", sourceId);

    setDeleteModal(null);
    if (error) {
      showToast("error", `Failed to delete: ${error.message}`);
    } else {
      showToast("success", `Account and ${deleteModal.txCount} transactions deleted.`);
    }
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

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 6000);
  }

  async function handleSync(accountId: string) {
    setSyncing(accountId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/banking/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ accountId }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        showToast("error", `Sync failed: ${error}`);
      } else {
        const result = await res.json();
        const balanceText =
          result.balance != null
            ? ` · Balance: ${formatCurrency(result.balance, result.currency)}`
            : "";
        showToast("success", `${result.imported} imported, ${result.skipped} skipped${balanceText}`);
        loadAccounts();
      }
    } catch (err) {
      showToast("error", `Sync error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleSyncAll() {
    const automated = accounts.filter(a => a.account_mode === "automated");
    if (automated.length === 0) return;
    setSyncingAll(true);
    let success = 0;
    let failed = 0;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSyncingAll(false); return; }

    for (const account of automated) {
      setSyncing(account.id);
      try {
        const res = await fetch("/api/banking/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ accountId: account.id }),
        });
        if (res.ok) success++; else failed++;
      } catch {
        failed++;
      }
    }
    setSyncing(null);
    setSyncingAll(false);
    loadAccounts();
    showToast("success", `Sync complete: ${success} OK${failed ? `, ${failed} failed` : ""}`);
  }

  async function handleConnectBank(accountId: string) {
    setConnectAccountId(accountId);
    setConnectModalOpen(true);
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
      {toast && (
        <div
          className={`fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md px-4 py-3 lg:top-4 ${
            toast.type === "success" ? "notice notice-success" : "notice notice-danger"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-current/70 hover:text-current"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-label text-[11px] text-[var(--color-secondary)]">Money</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-primary)] sm:text-3xl">
            Accounts
          </h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {accounts.some(a => a.account_mode === "automated") && (
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="btn btn-secondary"
            >
              <RefreshCw size={16} className={syncingAll ? "animate-spin" : ""} />
              Sync All
            </button>
          )}
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={16} />
            Add Account
          </button>
        </div>
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
            className={`cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[rgba(184,66,46,0.4)] focus:ring-offset-2 ${
              !account.is_active ? "opacity-50" : ""
            } ${
              account.account_mode === "automated"
                ? "!border-l-[3px] !border-l-[var(--color-tertiary)]"
                : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="h-4 w-4 flex-none rounded-full"
                  style={{ backgroundColor: account.color }}
                />
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-[var(--color-primary)]">{account.name}</h3>
                  <p className="truncate text-xs text-[var(--color-secondary)]">
                    {account.bank_name && `${account.bank_name} · `}
                    {ACCOUNT_TYPES.find((t) => t.value === account.type)?.label}
                  </p>
                  {account.iban && (
                    <p
                      className="mt-0.5 max-w-[180px] truncate text-[11px] text-[var(--color-secondary)]"
                      title={account.iban}
                    >
                      IBAN {account.iban}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-none gap-1">
                <button
                  onClick={(event) => {
                    stopCardNavigation(event);
                    openEdit(account);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label="Edit account"
                  className="btn btn-ghost px-2 py-1.5"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(event) => {
                    stopCardNavigation(event);
                    handleDelete(account.id);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label="Delete account"
                  className="btn btn-ghost px-2 py-1.5 hover:!text-[var(--color-danger)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="mt-4">
              {accounts.some(a => a.parent_account_id === account.id) ? (
                <>
                  <p className="text-xs text-[var(--color-secondary)]">Effective Balance</p>
                  <p
                    className={`text-xl font-bold ${
                      Number(account.current_balance) -
                        accounts
                          .filter(a => a.parent_account_id === account.id)
                          .reduce((sum, a) => sum + Number(a.current_balance), 0) >=
                      0
                        ? "text-[var(--color-primary)]"
                        : "amount-neg"
                    }`}
                  >
                    {formatCurrency(
                      Number(account.current_balance) -
                        accounts
                          .filter(a => a.parent_account_id === account.id)
                          .reduce((sum, a) => sum + Number(a.current_balance), 0),
                      account.currency
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-secondary)]">
                    Bank total: {formatCurrency(Number(account.current_balance), account.currency)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-[var(--color-secondary)]">Current Balance</p>
                  <p
                    className={`text-xl font-bold ${
                      Number(account.current_balance) >= 0
                        ? "text-[var(--color-primary)]"
                        : "amount-neg"
                    }`}
                  >
                    {formatCurrency(Number(account.current_balance), account.currency)}
                  </p>
                </>
              )}
            </div>

            {account.account_mode === "automated" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {bankConnections[account.id]?.status === "linked" ? (
                  <>
                    <Wifi size={12} className="text-[var(--color-success)]" />
                    <span className="text-xs text-[var(--color-success)]">Connected</span>
                    {bankConnections[account.id]?.last_synced_at && (
                      <span className="text-xs text-[var(--color-secondary)]">
                        · Synced{" "}
                        {format(
                          new Date(bankConnections[account.id].last_synced_at!),
                          "dd MMM HH:mm"
                        )}
                      </span>
                    )}
                    <button
                      onClick={(event) => {
                        stopCardNavigation(event);
                        handleSync(account.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={syncing === account.id}
                      className="btn btn-ghost ml-auto px-2 py-1 text-xs hover:!text-[var(--color-tertiary)]"
                    >
                      <RefreshCw
                        size={12}
                        className={syncing === account.id ? "animate-spin" : ""}
                      />
                      Sync
                    </button>
                  </>
                ) : bankConnections[account.id]?.status === "expired" ||
                  bankConnections[account.id]?.status === "error" ? (
                  <>
                    <WifiOff size={12} className="text-[var(--color-warning)]" />
                    <span className="text-xs text-[var(--color-warning)]">
                      {bankConnections[account.id]?.status === "expired" ? "Expired" : "Error"}
                    </span>
                    <button
                      onClick={(event) => {
                        stopCardNavigation(event);
                        handleConnectBank(account.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      className="btn btn-ghost ml-auto px-2 py-1 text-xs hover:!text-[var(--color-warning)]"
                    >
                      <Link2 size={12} />
                      Reconnect
                    </button>
                  </>
                ) : (
                  <>
                    <WifiOff size={12} className="text-[var(--color-secondary)]" />
                    <span className="text-xs text-[var(--color-secondary)]">Not connected</span>
                    <button
                      onClick={(event) => {
                        stopCardNavigation(event);
                        handleConnectBank(account.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      className="btn btn-ghost ml-auto px-2 py-1 text-xs hover:!text-[var(--color-tertiary)]"
                    >
                      <Link2 size={12} />
                      Connect Bank
                    </button>
                  </>
                )}
              </div>
            )}

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
                className={`chip ${account.is_active ? "chip-success" : ""}`}
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
            <p className="text-sm text-[var(--color-secondary)]">No accounts yet. Create your first one!</p>
          </div>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Account" : "New Account"}
        mobileSheet
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editing && (
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                Account Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_mode: "manual" })}
                  className={`rounded-md border px-3 py-3 text-left text-sm font-medium transition ${
                    form.account_mode === "manual"
                      ? "border-[var(--color-tertiary)] bg-[rgba(184,66,46,0.08)] text-[var(--color-tertiary)]"
                      : "border-[var(--color-border)] text-[var(--color-secondary)] hover:bg-[rgba(26,28,30,0.04)]"
                  }`}
                >
                  Manual
                  <span className="mt-0.5 block text-xs font-normal opacity-70">
                    Cash, Investments
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_mode: "automated" })}
                  className={`rounded-md border px-3 py-3 text-left text-sm font-medium transition ${
                    form.account_mode === "automated"
                      ? "border-[var(--color-tertiary)] bg-[rgba(184,66,46,0.08)] text-[var(--color-tertiary)]"
                      : "border-[var(--color-border)] text-[var(--color-secondary)] hover:bg-[rgba(26,28,30,0.04)]"
                  }`}
                >
                  Automated
                  <span className="mt-0.5 block text-xs font-normal opacity-70">
                    Bank connection
                  </span>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
              Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="field"
              placeholder="e.g., Main Checking"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })}
                className="field"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                Currency
              </label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
              Bank Name
            </label>
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              className="field"
              placeholder="e.g., ING, BBVA"
            />
          </div>

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
              IBAN / Account number
            </label>
            <input
              type="text"
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })}
              className="field"
              placeholder="e.g., ES8001287820840104072774"
            />
            <p className="mt-1 text-xs text-[var(--color-secondary)]">
              Used to detect transfers automatically during CSV imports and bank sync.
            </p>
          </div>

          {!editing && form.account_mode === "manual" && (
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                Initial Balance (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                className="field"
              />
            </div>
          )}

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
              Color
            </label>
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

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
              Account class
            </label>
            <select
              value={form.account_class}
              onChange={(e) =>
                setForm({
                  ...form,
                  account_class: e.target.value as "standard" | "remunerated" | "investment",
                })
              }
              className="field"
            >
              <option value="standard">Non-remunerated</option>
              <option value="remunerated">Remunerated</option>
              <option value="investment">Investment</option>
            </select>
          </div>

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
              Sub-account of
            </label>
            <select
              value={form.parent_account_id}
              onChange={(e) => setForm({ ...form, parent_account_id: e.target.value })}
              className="field"
            >
              <option value="">None (independent account)</option>
              {accounts
                .filter((a) => a.id !== editing?.id && !a.parent_account_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-secondary)]">
              If set, this account&apos;s balance will be subtracted from the parent&apos;s
              displayed balance.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete Account"
        mobileSheet
      >
        {deleteModal && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-primary)]">
              <strong>{deleteModal.account.name}</strong> has{" "}
              <strong>{deleteModal.txCount}</strong> linked transactions.
            </p>
            <p className="text-sm text-[var(--color-secondary)]">
              Move them to another account, or delete everything:
            </p>
            <select
              value={migrateTarget}
              onChange={(e) => setMigrateTarget(e.target.value)}
              className="field"
            >
              <option value="">Select account to migrate...</option>
              {accounts
                .filter((a) => a.id !== deleteModal.account.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </select>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAll}
                className="btn btn-danger-outline"
              >
                Delete All
              </button>
              <button
                type="button"
                disabled={!migrateTarget}
                onClick={confirmDeleteWithMigration}
                className="btn btn-danger"
              >
                Move &amp; Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Connect Bank Modal */}
      <Modal
        open={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        title="Connect Bank Account"
        mobileSheet
      >
        <BankConnectFlow
          accountId={connectAccountId}
          onClose={() => {
            setConnectModalOpen(false);
            loadAccounts();
          }}
        />
      </Modal>
    </div>
  );
}
