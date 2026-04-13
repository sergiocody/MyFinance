"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle } from "@/components/Card";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowRightLeft,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type { Account, Category } from "@/lib/database.types";

type TransactionAmountRow = {
  type: "income" | "expense" | "transfer";
  amount: number;
};

type TransactionCategoryRow = {
  amount: number;
  categories: Pick<Category, "name" | "color"> | null;
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
  expense: number;
}

interface CategorySummary {
  name: string;
  value: number;
  color: string;
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
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
      setTotalBalance(typedAccounts.reduce((sum, a) => sum + Number(a.current_balance), 0));
    }

    const now = new Date();
    const monthStart = startOfMonth(now).toISOString().split("T")[0];
    const monthEnd = endOfMonth(now).toISOString().split("T")[0];

    const { data: monthTx } = await supabase
      .from("transactions")
      .select("type, amount")
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
      const mStart = startOfMonth(m).toISOString().split("T")[0];
      const mEnd = endOfMonth(m).toISOString().split("T")[0];

      const { data: mTx } = await supabase
        .from("transactions")
        .select("type, amount")
        .gte("date", mStart)
        .lte("date", mEnd);

      const typedMonthRows = (mTx ?? []) as TransactionAmountRow[];

      months.push({
        month: format(m, "MMM"),
        income: typedMonthRows.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
        expense: typedMonthRows.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      });
    }
    setMonthlyData(months);

    const { data: catTx } = await supabase
      .from("transactions")
      .select("amount, categories(name, color)")
      .eq("type", "expense")
      .gte("date", monthStart)
      .lte("date", monthEnd);

    if (catTx) {
      const typedCategoryRows = catTx as TransactionCategoryRow[];
      const catMap = new Map<string, { value: number; color: string }>();
      for (const t of typedCategoryRows) {
        const cat = t.categories;
        const name = cat?.name ?? "Uncategorized";
        const color = cat?.color ?? "#94a3b8";
        const existing = catMap.get(name) ?? { value: 0, color };
        existing.value += Number(t.amount);
        catMap.set(name, existing);
      }
      setCategoryData(
        Array.from(catMap.entries())
          .map(([name, { value, color }]) => ({ name, value, color }))
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-12 lg:pt-0">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Balance</CardTitle>
            <Wallet className="h-5 w-5 text-indigo-500" />
          </CardHeader>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalBalance)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {accounts.length} active account{accounts.length !== 1 ? "s" : ""}
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Income</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </CardHeader>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(monthIncome)}</p>
          <p className="mt-1 text-xs text-gray-500">{format(new Date(), "MMMM yyyy")}</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Expenses</CardTitle>
            <TrendingDown className="h-5 w-5 text-red-500" />
          </CardHeader>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(monthExpense)}</p>
          <p className="mt-1 text-xs text-gray-500">{format(new Date(), "MMMM yyyy")}</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net This Month</CardTitle>
            <ArrowRightLeft className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <p className={`text-2xl font-bold ${monthIncome - monthExpense >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(monthIncome - monthExpense)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Income - Expenses</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-gray-500">Income vs Expenses (Last 6 Months)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={tooltipCurrency} />
                <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-medium text-gray-500">Expenses by Category (This Month)</h3>
          {categoryData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipCurrency} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">
              No expenses this month
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-gray-500">Accounts</h3>
        {accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: account.color }} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{account.name}</p>
                    <p className="text-xs text-gray-500">{account.bank_name ?? account.type}</p>
                  </div>
                </div>
                <p className={`text-sm font-semibold ${Number(account.current_balance) >= 0 ? "text-gray-900" : "text-red-600"}`}>
                  {formatCurrency(Number(account.current_balance))}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">
            No accounts yet. Create one in the Accounts page.
          </div>
        )}
      </Card>
    </div>
  );
}
