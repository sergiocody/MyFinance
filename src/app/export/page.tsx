"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Card } from "@/components/Card";
import { supabase } from "@/lib/supabase";
import type { Account, Category, Label, Transaction } from "@/lib/database.types";
import {
  CalendarRange,
  Download,
  FolderOpen,
  Loader2,
  Tag,
  Wallet,
} from "lucide-react";

type ExportKey = "transactions" | "accounts" | "categories" | "labels";
type FeedbackTone = "neutral" | "success" | "error";
type SupabaseError = { message: string } | null;
type SupabasePageResult<T> = { data: T[] | null; error: SupabaseError };
type ExportCounts = Record<ExportKey, number>;
type ExportFlags = Record<ExportKey, boolean>;
type ExportFeedback = Record<ExportKey, { tone: FeedbackTone; text: string }>;

type TransactionExportRecord = Transaction & {
  categories: Pick<Category, "name"> | null;
  accounts: Pick<Account, "name"> | null;
  destination_account: Pick<Account, "name"> | null;
  transaction_labels: { labels: Pick<Label, "name"> | null }[] | null;
};

type CsvCell = string | number | boolean;
type CsvRow = Record<string, CsvCell>;

const EXPORT_BATCH_SIZE = 1000;
const primaryButtonClassName = "btn btn-ink";
const secondaryButtonClassName = "btn btn-secondary";
const inputClassName = "field";

function createCountsState(): ExportCounts {
  return {
    transactions: 0,
    accounts: 0,
    categories: 0,
    labels: 0,
  };
}

function createFlagsState(): ExportFlags {
  return {
    transactions: false,
    accounts: false,
    categories: false,
    labels: false,
  };
}

function createFeedbackState(): ExportFeedback {
  return {
    transactions: { tone: "neutral", text: "" },
    accounts: { tone: "neutral", text: "" },
    categories: { tone: "neutral", text: "" },
    labels: { tone: "neutral", text: "" },
  };
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function sanitizeCell(value: unknown): CsvCell {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  return String(value);
}

function downloadCsv(filename: string, columns: string[], rows: CsvRow[]) {
  const csv = Papa.unparse(
    {
      fields: columns,
      data: rows.map((row) => columns.map((column) => sanitizeCell(row[column]))),
    },
    {
      delimiter: ";",
      newline: "\r\n",
    }
  );

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function fetchPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<SupabasePageResult<T>>
) {
  const rows: T[] = [];

  for (let from = 0; ; from += EXPORT_BATCH_SIZE) {
    const to = from + EXPORT_BATCH_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < EXPORT_BATCH_SIZE) {
      break;
    }
  }

  return rows;
}

function getFeedbackClassName(tone: FeedbackTone) {
  if (tone === "error") {
    return "text-sm text-[var(--color-danger)]";
  }

  if (tone === "success") {
    return "text-sm text-[var(--color-success)]";
  }

  return "text-sm text-[var(--color-secondary)]";
}

export default function ExportPage() {
  const [counts, setCounts] = useState<ExportCounts>(createCountsState);
  const [exporting, setExporting] = useState<ExportFlags>(createFlagsState);
  const [feedback, setFeedback] = useState<ExportFeedback>(createFeedbackState);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [today, setToday] = useState("");
  const [transactionDateFrom, setTransactionDateFrom] = useState("");
  const [transactionDateTo, setTransactionDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setSummaryLoading(true);
      setSummaryError("");

      const currentDate = getTodayDate();
      const [transactionsResponse, accountsResponse, categoriesResponse, labelsResponse] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("date", { count: "exact" })
            .order("date", { ascending: false })
            .limit(1),
          supabase.from("accounts").select("id", { count: "exact", head: true }),
          supabase.from("categories").select("id", { count: "exact", head: true }),
          supabase.from("labels").select("id", { count: "exact", head: true }),
        ]);

      if (cancelled) {
        return;
      }

      const firstError =
        transactionsResponse.error ??
        accountsResponse.error ??
        categoriesResponse.error ??
        labelsResponse.error;

      if (firstError) {
        setSummaryError(firstError.message);
        setSummaryLoading(false);
        return;
      }

      setToday(currentDate);
      setTransactionDateTo(currentDate);
      setTransactionDateFrom(transactionsResponse.data?.[0]?.date ?? currentDate);
      setCounts({
        transactions: transactionsResponse.count ?? 0,
        accounts: accountsResponse.count ?? 0,
        categories: categoriesResponse.count ?? 0,
        labels: labelsResponse.count ?? 0,
      });
      setSummaryLoading(false);
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateExportState(key: ExportKey, next: boolean) {
    setExporting((current) => ({ ...current, [key]: next }));
  }

  function updateFeedback(key: ExportKey, tone: FeedbackTone, text: string) {
    setFeedback((current) => ({
      ...current,
      [key]: { tone, text },
    }));
  }

  async function handleExportTransactions() {
    if (!transactionDateFrom || !transactionDateTo) {
      updateFeedback("transactions", "error", "Choose a start and end date first.");
      return;
    }

    if (transactionDateFrom > transactionDateTo) {
      updateFeedback("transactions", "error", "The start date cannot be after the end date.");
      return;
    }

    updateExportState("transactions", true);
    updateFeedback("transactions", "neutral", "Preparing CSV export...");

    try {
      const transactions = await fetchPaginated<TransactionExportRecord>(async (from, to) => {
        const query = supabase
          .from("transactions")
          .select(
            "*, categories(name), accounts:accounts!transactions_account_id_fkey(name), destination_account:accounts!transactions_transfer_to_account_id_fkey(name), transaction_labels(labels(name))"
          )
          .gte("date", transactionDateFrom)
          .lte("date", transactionDateTo)
          .order("date", { ascending: false })
          .range(from, to);

        const { data, error } = await query;

        return {
          data: data as unknown as TransactionExportRecord[] | null,
          error,
        };
      });

      const columns = [
        "id",
        "user_id",
        "account_id",
        "account_name",
        "category_id",
        "category_name",
        "type",
        "amount",
        "description",
        "notes",
        "date",
        "transaction_hash",
        "transfer_to_account_id",
        "transfer_to_account_name",
        "import_id",
        "labels",
        "created_at",
        "updated_at",
      ];
      const rows = transactions.map((transaction) => ({
        id: transaction.id,
        user_id: transaction.user_id ?? "",
        account_id: transaction.account_id,
        account_name: transaction.accounts?.name ?? "",
        category_id: transaction.category_id ?? "",
        category_name: transaction.categories?.name ?? "",
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description ?? "",
        notes: transaction.notes ?? "",
        date: transaction.date,
        transaction_hash: transaction.transaction_hash ?? "",
        transfer_to_account_id: transaction.transfer_to_account_id ?? "",
        transfer_to_account_name: transaction.destination_account?.name ?? "",
        import_id: transaction.import_id ?? "",
        labels:
          transaction.transaction_labels
            ?.flatMap((item) => (item.labels?.name ? [item.labels.name] : []))
            .join(", ") ?? "",
        created_at: transaction.created_at,
        updated_at: transaction.updated_at,
      }));

      downloadCsv(
        `transactions-${transactionDateFrom}-to-${transactionDateTo}.csv`,
        columns,
        rows
      );
      updateFeedback(
        "transactions",
        "success",
        `Exported ${rows.length} transaction${rows.length === 1 ? "" : "s"} to CSV.`
      );
    } catch (error) {
      updateFeedback(
        "transactions",
        "error",
        error instanceof Error ? error.message : "Transactions could not be exported."
      );
    } finally {
      updateExportState("transactions", false);
    }
  }

  async function handleExportAccounts() {
    updateExportState("accounts", true);
    updateFeedback("accounts", "neutral", "Preparing CSV export...");

    try {
      const accounts = await fetchPaginated<Account>(async (from, to) => {
        const { data, error } = await supabase
          .from("accounts")
          .select("*")
          .order("name")
          .range(from, to);

        return { data, error };
      });

      const columns = [
        "id",
        "user_id",
        "name",
        "type",
        "currency",
        "initial_balance",
        "current_balance",
        "bank_name",
        "color",
        "is_active",
        "created_at",
        "updated_at",
      ];

      downloadCsv("accounts.csv", columns, accounts as unknown as CsvRow[]);
      updateFeedback(
        "accounts",
        "success",
        `Exported ${accounts.length} account${accounts.length === 1 ? "" : "s"} to CSV.`
      );
    } catch (error) {
      updateFeedback(
        "accounts",
        "error",
        error instanceof Error ? error.message : "Accounts could not be exported."
      );
    } finally {
      updateExportState("accounts", false);
    }
  }

  async function handleExportCategories() {
    updateExportState("categories", true);
    updateFeedback("categories", "neutral", "Preparing CSV export...");

    try {
      const categories = await fetchPaginated<Category>(async (from, to) => {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .order("type")
          .order("name")
          .range(from, to);

        return { data, error };
      });

      const columns = ["id", "user_id", "name", "type", "icon", "color", "created_at"];

      downloadCsv("categories.csv", columns, categories as unknown as CsvRow[]);
      updateFeedback(
        "categories",
        "success",
        `Exported ${categories.length} categor${categories.length === 1 ? "y" : "ies"} to CSV.`
      );
    } catch (error) {
      updateFeedback(
        "categories",
        "error",
        error instanceof Error ? error.message : "Categories could not be exported."
      );
    } finally {
      updateExportState("categories", false);
    }
  }

  async function handleExportLabels() {
    updateExportState("labels", true);
    updateFeedback("labels", "neutral", "Preparing CSV export...");

    try {
      const labels = await fetchPaginated<Label>(async (from, to) => {
        const { data, error } = await supabase
          .from("labels")
          .select("*")
          .order("name")
          .range(from, to);

        return { data, error };
      });

      const columns = ["id", "user_id", "name", "color", "created_at"];

      downloadCsv("labels.csv", columns, labels as unknown as CsvRow[]);
      updateFeedback(
        "labels",
        "success",
        `Exported ${labels.length} label${labels.length === 1 ? "" : "s"} to CSV.`
      );
    } catch (error) {
      updateFeedback(
        "labels",
        "error",
        error instanceof Error ? error.message : "Labels could not be exported."
      );
    } finally {
      updateExportState("labels", false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden rounded-md px-5 py-6 sm:px-6 sm:py-8">
        <p className="font-label text-[11px] text-[var(--color-secondary)]">Data Portability</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-primary)] sm:text-3xl">
              Export your finance tables to CSV
            </h1>
            <p className="text-sm text-[var(--color-secondary)] sm:text-base">
              Download transactions with a chosen date range, or export accounts, categories,
              and labels as standalone CSV files ready for Excel.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-md border border-[var(--color-border)] bg-white/90 px-4 py-3">
              <p className="font-label text-[10px] text-[var(--color-secondary)]">Transactions</p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-primary)]">
                {summaryLoading ? "..." : counts.transactions}
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] bg-white/90 px-4 py-3">
              <p className="font-label text-[10px] text-[var(--color-secondary)]">Accounts</p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-primary)]">
                {summaryLoading ? "..." : counts.accounts}
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] bg-white/90 px-4 py-3">
              <p className="font-label text-[10px] text-[var(--color-secondary)]">Categories</p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-primary)]">
                {summaryLoading ? "..." : counts.categories}
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] bg-white/90 px-4 py-3">
              <p className="font-label text-[10px] text-[var(--color-secondary)]">Labels</p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-primary)]">
                {summaryLoading ? "..." : counts.labels}
              </p>
            </div>
          </div>
        </div>
      </section>

      {summaryError && (
        <div className="notice notice-danger">
          Could not load export summary: {summaryError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[rgba(184,66,46,0.12)] text-[var(--color-tertiary)]">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <p className="font-label text-[11px] text-[var(--color-secondary)]">
                  Transactions CSV
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-primary)] sm:text-2xl">
                  Export by date range
                </h2>
                <p className="mt-1 max-w-xl text-sm text-[var(--color-secondary)]">
                  The default range starts at the most recent transaction date found in the
                  ledger and ends today. The CSV includes raw transaction columns plus account,
                  category, destination account, and label names.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportTransactions}
              disabled={summaryLoading || exporting.transactions}
              className={primaryButtonClassName}
            >
              {exporting.transactions ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export transactions
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                From
              </label>
              <input
                type="date"
                value={transactionDateFrom}
                max={transactionDateTo || today}
                onChange={(event) => setTransactionDateFrom(event.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                To
              </label>
              <input
                type="date"
                value={transactionDateTo}
                min={transactionDateFrom || undefined}
                max={today || undefined}
                onChange={(event) => setTransactionDateTo(event.target.value)}
                className={inputClassName}
              />
            </div>
          </div>

          {feedback.transactions.text && (
            <p className={getFeedbackClassName(feedback.transactions.tone)}>
              {feedback.transactions.text}
            </p>
          )}
        </Card>

        <div className="grid gap-6">
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[rgba(26,28,30,0.06)] text-[var(--color-primary)]">
                  <Wallet className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-[var(--color-primary)]">
                  Accounts
                </h2>
                <p className="mt-1 text-sm text-[var(--color-secondary)]">
                  Export the full `accounts` table with balances, currencies, and account metadata.
                </p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-secondary)]">
                {summaryLoading ? "..." : `${counts.accounts} rows`}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportAccounts}
              disabled={exporting.accounts}
              className={secondaryButtonClassName}
            >
              {exporting.accounts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export accounts
            </button>

            {feedback.accounts.text && (
              <p className={getFeedbackClassName(feedback.accounts.tone)}>{feedback.accounts.text}</p>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[rgba(26,28,30,0.06)] text-[var(--color-primary)]">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-[var(--color-primary)]">
                  Categories
                </h2>
                <p className="mt-1 text-sm text-[var(--color-secondary)]">
                  Export the full `categories` table ordered by type and name.
                </p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-secondary)]">
                {summaryLoading ? "..." : `${counts.categories} rows`}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportCategories}
              disabled={exporting.categories}
              className={secondaryButtonClassName}
            >
              {exporting.categories ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export categories
            </button>

            {feedback.categories.text && (
              <p className={getFeedbackClassName(feedback.categories.tone)}>
                {feedback.categories.text}
              </p>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[rgba(26,28,30,0.06)] text-[var(--color-primary)]">
                  <Tag className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-[var(--color-primary)]">
                  Labels
                </h2>
                <p className="mt-1 text-sm text-[var(--color-secondary)]">
                  Export the full `labels` table with colors and creation timestamps.
                </p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-secondary)]">
                {summaryLoading ? "..." : `${counts.labels} rows`}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportLabels}
              disabled={exporting.labels}
              className={secondaryButtonClassName}
            >
              {exporting.labels ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export labels
            </button>

            {feedback.labels.text && (
              <p className={getFeedbackClassName(feedback.labels.tone)}>{feedback.labels.text}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}