"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle } from "@/components/Card";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowRightLeft,
  ArrowUpRight,
  Plus,
  Landmark,
  PiggyBank,
} from "lucide-react";
import {
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type { Account, Category } from "@/lib/database.types";

type TransactionAmountRow = {
  type: "income" | "expense" | "transfer";
  amount: number;
};

type TransactionCategoryRow = {
  amount: number;
  categories: Pick<Category, "id" | "name" | "color"> | null;
};

function tooltipCurrency(
  value: number | string | readonly (number | string)[] | undefined
) {
  const amount = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0);
  return formatCurrency(amount);
}

interface MonthlySummary {
  month: string;
  income: number;
  transfer: number;
  expense: number;
}

interface CategorySummary {
  id: string;
  name: string;
  value: number;
  color: string;
}

const QUICK_TRANSACTION_LINKS = [
  {
    href: "/transactions?new=1&flow=expense",
    label: "Expense",
    description: "Record spend",
    icon: ArrowUpRight,
    accent: "danger",
  },
  {
    href: "/transactions?new=1&flow=income",
    label: "Income",
    description: "Log money in",
    icon: ArrowDownLeft,
    accent: "success",
  },
  {
    href: "/transactions?new=1&flow=transfer",
    label: "Transfer",
    description: "Move funds",
    icon: ArrowRightLeft,
    accent: "info",
  },
] as const;

const QUICK_LINK_CLASS: Record<(typeof QUICK_TRANSACTION_LINKS)[number]["accent"], string> = {
  danger:
    "border-[rgba(184,66,46,0.24)] bg-[rgba(184,66,46,0.06)] text-[var(--color-danger)] hover:border-[rgba(184,66,46,0.4)] hover:bg-[rgba(184,66,46,0.10)]",
  success:
    "border-[rgba(63,107,78,0.24)] bg-[rgba(63,107,78,0.06)] text-[var(--color-success)] hover:border-[rgba(63,107,78,0.4)] hover:bg-[rgba(63,107,78,0.10)]",
  info:
    "border-[rgba(58,79,102,0.24)] bg-[rgba(58,79,102,0.06)] text-[var(--color-info)] hover:border-[rgba(58,79,102,0.4)] hover:bg-[rgba(58,79,102,0.10)]",
};

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [remuneratedBalance, setRemuneratedBalance] = useState(0);
  const [nonRemuneratedBalance, setNonRemuneratedBalance] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([]);
  const [categoryData, setCategoryData] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setLoading(true);

    const { data: accts } = await supabase
      .from("accounts")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (accts) {
      const typedAccounts = accts as Account[];
      setAccounts(typedAccounts);
      setTotalBalance(
        typedAccounts
          .filter(a => a.account_class !== "investment")
          .reduce((sum, a) => sum + Number(a.current_balance), 0)
      );

      const childBalanceByParent = new Map<string, number>();
      for (const a of typedAccounts) {
        if (a.parent_account_id) {
          childBalanceByParent.set(
            a.parent_account_id,
            (childBalanceByParent.get(a.parent_account_id) ?? 0) + Number(a.current_balance)
          );
        }
      }

      let remBal = 0;
      let nonRemBal = 0;
      for (const a of typedAccounts) {
        if (a.account_class === "investment") continue;
        const effectiveBalance = Number(a.current_balance) - (childBalanceByParent.get(a.id) ?? 0);
        if (a.account_class === "remunerated") {
          remBal += Number(a.current_balance);
        } else {
          nonRemBal += effectiveBalance;
        }
      }
      setRemuneratedBalance(remBal);
      setNonRemuneratedBalance(nonRemBal);
    }

    const now = new Date();
    const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

    const { data: monthTx } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("is_split", false)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    if (monthTx) {
      const typedMonthTx = monthTx as TransactionAmountRow[];
      setMonthIncome(
        typedMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0)
      );
      setMonthExpense(
        typedMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0)
      );
    }

    const months: MonthlySummary[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(now, i);
      const mStart = format(startOfMonth(m), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m), "yyyy-MM-dd");

      const { data: mTx } = await supabase
        .from("transactions")
        .select("type, amount")
        .eq("is_split", false)
        .gte("date", mStart)
        .lte("date", mEnd);

      const typedMonthRows = (mTx ?? []) as TransactionAmountRow[];

      months.push({
        month: format(m, "MMM"),
        income: typedMonthRows.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
        transfer: typedMonthRows.filter((t) => t.type === "transfer").reduce((s, t) => s + Number(t.amount), 0),
        expense: typedMonthRows.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      });
    }
    setMonthlyData(months);

    const { data: catTx } = await supabase
      .from("transactions")
      .select("amount, categories(id, name, color)")
      .eq("type", "expense")
      .eq("is_split", false)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    if (catTx) {
      const typedCategoryRows = catTx as TransactionCategoryRow[];
      const catMap = new Map<string, { id: string; value: number; color: string }>();
      for (const t of typedCategoryRows) {
        const cat = t.categories;
        const id = cat?.id ?? "uncategorized";
        const name = cat?.name ?? "Uncategorized";
        const color = cat?.color ?? "#6C7278";
        const existing = catMap.get(name) ?? { id, value: 0, color };
        existing.value += Number(t.amount);
        catMap.set(name, existing);
      }
      setCategoryData(
        Array.from(catMap.entries())
          .map(([name, { id, value, color }]) => ({ id, name, value, color }))
          .sort((a, b) => b.value - a.value)
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-tertiary)] border-t-transparent"
        />
      </div>
    );
  }

  const net = monthIncome - monthExpense;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            <Image
              src="/Myfinance.png"
              alt="MyFinance Logo"
              width={48}
              height={48}
              className="mt-1 h-10 w-10 flex-none object-contain sm:h-12 sm:w-12"
            />
            <div className="min-w-0">
              <p className="label-caps">Overview</p>
              <h1 className="page-title mt-1">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-[var(--color-secondary)]">
                Quick entry below — or jump into income and transfer flows.
              </p>
            </div>
          </div>
          <Link
            href="/transactions?new=1&flow=expense"
            className="btn btn-primary w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New Transaction
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {QUICK_TRANSACTION_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`pressable flex items-center gap-3 rounded-md border p-4 ${QUICK_LINK_CLASS[item.accent]}`}
              >
                <span className="inline-flex flex-none rounded-full bg-white/80 p-2">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs text-current/80">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Balance</CardTitle>
            <Wallet className="h-5 w-5 flex-none text-[var(--color-tertiary)]" aria-hidden />
          </CardHeader>
          <p className="stat-value text-[var(--color-primary)]">
            {formatCurrency(totalBalance)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-secondary)]">
            {accounts.length} active account{accounts.length !== 1 ? "s" : ""}
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Income</CardTitle>
            <TrendingUp className="h-5 w-5 flex-none text-[var(--color-success)]" aria-hidden />
          </CardHeader>
          <p className="stat-value amount-pos">{formatCurrency(monthIncome)}</p>
          <p className="mt-1 text-xs text-[var(--color-secondary)]">{format(new Date(), "MMMM yyyy")}</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Expenses</CardTitle>
            <TrendingDown className="h-5 w-5 flex-none text-[var(--color-danger)]" aria-hidden />
          </CardHeader>
          <p className="stat-value amount-neg">{formatCurrency(monthExpense)}</p>
          <p className="mt-1 text-xs text-[var(--color-secondary)]">{format(new Date(), "MMMM yyyy")}</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net This Month</CardTitle>
            <ArrowRightLeft className="h-5 w-5 flex-none text-[var(--color-secondary)]" aria-hidden />
          </CardHeader>
          <p className={`stat-value ${net >= 0 ? "amount-pos" : "amount-neg"}`}>
            {formatCurrency(net)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-secondary)]">Income - Expenses</p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Remunerated</CardTitle>
            <PiggyBank className="h-5 w-5 flex-none text-[var(--color-success)]" aria-hidden />
          </CardHeader>
          <p className="stat-value text-[var(--color-primary)]">
            {formatCurrency(remuneratedBalance)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-secondary)]">
            {accounts.filter(a => a.account_class === "remunerated").length} account
            {accounts.filter(a => a.account_class === "remunerated").length !== 1 ? "s" : ""}
          </p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Non-remunerated</CardTitle>
            <Landmark className="h-5 w-5 flex-none text-[var(--color-secondary)]" aria-hidden />
          </CardHeader>
          <p className="stat-value text-[var(--color-primary)]">
            {formatCurrency(nonRemuneratedBalance)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-secondary)]">
            {accounts.filter(a => a.account_class === "standard").length} account
            {accounts.filter(a => a.account_class === "standard").length !== 1 ? "s" : ""}
          </p>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="label-caps mb-4">
            Income, Transfers & Expenses (Last 6 Months)
          </h3>
          <div className="h-56 min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-secondary)" fontSize={12} />
                <YAxis stroke="var(--color-secondary)" fontSize={12} />
                <Tooltip formatter={tooltipCurrency} />
                <Legend />
                <Bar dataKey="income" name="Income" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="transfer" name="Transfers" fill="var(--color-info)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expenses" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="label-caps mb-4">
            Expenses by Category (This Month)
          </h3>
          {categoryData.length > 0 ? (
            <div className="space-y-3">
              {(() => {
                const total = categoryData.reduce((s, c) => s + c.value, 0);
                const now = new Date();
                const from = format(startOfMonth(now), "yyyy-MM-dd");
                const to = format(endOfMonth(now), "yyyy-MM-dd");
                return categoryData.map((cat) => (
                  <Link
                    key={cat.name}
                    href={cat.id !== "uncategorized"
                      ? `/transactions?category=${cat.id}&type=expense&from=${from}&to=${to}`
                      : `/transactions?type=expense&from=${from}&to=${to}`}
                    className="pressable -mx-2 block space-y-2 rounded-sm px-2 py-2 hover:bg-[var(--color-hover)]"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-block h-3 w-3 flex-none rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="truncate text-[var(--color-primary)]">{cat.name}</span>
                      </div>
                      <span className="flex-none font-medium tabular-nums text-[var(--color-primary)]">{formatCurrency(cat.value)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(26,28,30,0.06)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${((cat.value / total) * 100).toFixed(1)}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </Link>
                ));
              })()}
              <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-sm font-semibold">
                <span className="text-[var(--color-secondary)]">Total</span>
                <span className="tabular-nums text-[var(--color-primary)]">
                  {formatCurrency(categoryData.reduce((s, c) => s + c.value, 0))}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--color-secondary)]">
              No expenses this month
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="label-caps mb-4">Accounts</h3>
        {accounts.length > 0 ? (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white/70 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: account.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-primary)]">{account.name}</p>
                    <p className="truncate text-xs text-[var(--color-secondary)]">
                      {account.bank_name ?? account.type}
                    </p>
                  </div>
                </div>
                <p
                  className={`flex-none text-sm font-semibold tabular-nums ${
                    Number(account.current_balance) >= 0 ? "text-[var(--color-primary)]" : "amount-neg"
                  }`}
                >
                  {formatCurrency(Number(account.current_balance))}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-[var(--color-secondary)]">
            No accounts yet. Create one in the Accounts page.
          </div>
        )}
      </Card>
    </div>
  );
}
