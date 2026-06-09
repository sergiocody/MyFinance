"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { LabelMultiSelect } from "@/components/LabelMultiSelect";
import { createTransactionHash, formatCurrency, formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import type { Account, Category, Label } from "@/lib/database.types";

type TransferRole = "source" | "destination";

type ParserProvider = "gemini" | "ollama-gemma" | "ollama-qwen";

const parserOptions: Record<
  ParserProvider,
  { label: string; description: string }
> = {
  gemini: {
    label: "Gemini",
    description: "Uses Google Gemini via GEMINI_API_KEY on the server.",
  },
  "ollama-gemma": {
    label: "Ollama Gemma",
    description: "Uses your local Ollama model at http://localhost:11434 (default: gemma3:4b).",
  },
  "ollama-qwen": {
    label: "Ollama Qwen",
    description: "Uses your local Ollama model at http://localhost:11434 (default: qwen3:8b).",
  },
};

type ParsedTransactionDraft = {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category_id: string | null;
  label_ids: string[];
  transfer_account_id: string | null;
  selected_account_role: TransferRole | null;
  notes: string;
};

interface ParsedTransaction extends ParsedTransactionDraft {
  hash: string;
  duplicateSource: "existing" | "file" | null;
  validationError: string | null;
  selected: boolean;
}

type ImportStep = "upload" | "parsing" | "review" | "importing" | "done";

type PersistedTransactionRow = {
  account_id: string;
  category_id: string | null;
  type: "income" | "expense" | "transfer";
  amount: number;
  description: string;
  notes: string | null;
  date: string;
  transaction_hash: string;
  transfer_to_account_id: string | null;
  import_id: string | null;
};

function buildTransferFingerprint(
  date: string,
  amount: number,
  accountId: string,
  transferToAccountId: string
) {
  return [date, Number(amount).toFixed(2), accountId, transferToAccountId].join("|");
}

function getTransactionValidationError(
  transaction: ParsedTransactionDraft,
  selectedAccountId: string
) {
  if (transaction.type !== "transfer") {
    return null;
  }

  if (!transaction.transfer_account_id) {
    return "Select the other account for this transfer";
  }

  if (!transaction.selected_account_role) {
    return "Choose whether this transfer is incoming or outgoing";
  }

  if (transaction.transfer_account_id === selectedAccountId) {
    return "Transfer account must be different from the imported account";
  }

  return null;
}

function getTransferAccounts(transaction: ParsedTransactionDraft, selectedAccountId: string) {
  if (
    transaction.type !== "transfer" ||
    !transaction.transfer_account_id ||
    !transaction.selected_account_role
  ) {
    return null;
  }

  return transaction.selected_account_role === "destination"
    ? {
        account_id: transaction.transfer_account_id,
        transfer_to_account_id: selectedAccountId,
      }
    : {
        account_id: selectedAccountId,
        transfer_to_account_id: transaction.transfer_account_id,
      };
}

function getSelectedAccountDelta(transaction: ParsedTransactionDraft) {
  if (transaction.type === "income") {
    return transaction.amount;
  }

  if (transaction.type === "expense") {
    return -transaction.amount;
  }

  if (transaction.selected_account_role === "destination") {
    return transaction.amount;
  }

  return -transaction.amount;
}

function hydrateTransactions(
  drafts: ParsedTransactionDraft[],
  selectedAccountId: string,
  existingHashes: Set<string>,
  existingTransferFingerprints: Set<string>
) {
  const seenHashes = new Set<string>();
  const seenTransferFingerprints = new Set<string>();

  return drafts.map((transaction) => {
    const previousSelected =
      "selected" in transaction && typeof transaction.selected === "boolean"
        ? transaction.selected
        : undefined;
    const hash = createTransactionHash({
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
    });
    const validationError = getTransactionValidationError(transaction, selectedAccountId);
    let duplicateSource: "existing" | "file" | null = null;

    if (transaction.type === "transfer") {
      const transferAccounts = getTransferAccounts(transaction, selectedAccountId);

      if (transferAccounts) {
        const fingerprint = buildTransferFingerprint(
          transaction.date,
          transaction.amount,
          transferAccounts.account_id,
          transferAccounts.transfer_to_account_id
        );

        duplicateSource = existingTransferFingerprints.has(fingerprint)
          ? "existing"
          : seenTransferFingerprints.has(fingerprint)
            ? "file"
            : null;

        seenTransferFingerprints.add(fingerprint);
      }
    } else {
      duplicateSource = existingHashes.has(hash)
        ? "existing"
        : seenHashes.has(hash)
          ? "file"
          : null;

      seenHashes.add(hash);
    }

    return {
      ...transaction,
      hash,
      duplicateSource,
      validationError,
      selected:
        validationError !== null
          ? false
          : previousSelected ?? duplicateSource === null,
    };
  });
}

function isMissingOnConflictConstraint(error: { message?: string } | null | undefined) {
  return error?.message?.includes(
    "there is no unique or exclusion constraint matching the ON CONFLICT specification"
  );
}

function isDuplicateKeyError(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

const TYPE_SELECT_CLASS: Record<"income" | "expense" | "transfer", string> = {
  income:
    "border-[rgba(63,107,78,0.32)] bg-[rgba(63,107,78,0.08)] text-[var(--color-success)]",
  expense:
    "border-[rgba(184,66,46,0.32)] bg-[rgba(184,66,46,0.08)] text-[var(--color-danger)]",
  transfer:
    "border-[rgba(58,79,102,0.32)] bg-[rgba(58,79,102,0.08)] text-[var(--color-info)]",
};

export default function ImportPage() {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [parserProvider, setParserProvider] = useState<ParserProvider>("gemini");
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [existingTransferFingerprints, setExistingTransferFingerprints] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0 });
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [balanceOverride, setBalanceOverride] = useState<string>("");
  const [editingBalance, setEditingBalance] = useState(false);

  const parserLabel = parserOptions[parserProvider].label;

  const currentAccount = accounts.find((a) => a.id === selectedAccount);
  const currentAccountId = currentAccount?.id ?? null;
  const currentAccountBalance = currentAccount?.current_balance ?? null;

  useEffect(() => {
    if (currentAccountBalance !== null) {
      setBalanceOverride(String(currentAccountBalance));
    }
  }, [currentAccountId, currentAccountBalance]);

  const baseBalance = parseFloat(balanceOverride) || 0;
  const projectedBalance = currentAccount
    ? baseBalance +
      transactions
        .filter((t) => t.selected)
        .reduce((sum, t) => sum + getSelectedAccountDelta(t), 0)
    : null;

  useEffect(() => {
    async function load() {
      const [{ data: accts }, { data: cats }, { data: lbls }] = await Promise.all([
        supabase.from("accounts").select("*").eq("is_active", true).order("name"),
        supabase.from("categories").select("*").order("name"),
        supabase.from("labels").select("*").order("name"),
      ]);
      if (accts) {
        setAccounts(accts);
        if (accts.length > 0) setSelectedAccount(accts[0].id);
      }
      if (cats) setCategories(cats);
      if (lbls) setLabels(lbls);
    }
    load();
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      setError("");
      setFileName(file.name);

      if (!selectedAccount) {
        setError("Please select an account first");
        return;
      }

      const text = await file.text();

      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        setError("File appears empty or has only headers");
        return;
      }

      setStep("parsing");

      try {
        const { data: statementTransactions } = await supabase
          .from("transactions")
          .select("account_id, transfer_to_account_id, date, description, amount, type")
          .or(`account_id.eq.${selectedAccount},transfer_to_account_id.eq.${selectedAccount}`);

        const existingTransactions = (statementTransactions ?? []) as Array<{
          account_id: string;
          transfer_to_account_id: string | null;
          date: string;
          description: string | null;
          amount: number;
          type: "income" | "expense" | "transfer";
        }>;

        const existingHashesSet = new Set(
          existingTransactions
            .filter((transaction) => transaction.account_id === selectedAccount)
            .map((transaction) =>
              createTransactionHash({
                date: transaction.date,
                type: transaction.type,
                amount: Number(transaction.amount),
                description: transaction.description,
              })
            )
        );

        const existingTransferFingerprintsSet = new Set(
          existingTransactions
            .filter(
              (transaction) =>
                transaction.type === "transfer" &&
                transaction.transfer_to_account_id !== null
            )
            .map((transaction) =>
              buildTransferFingerprint(
                transaction.date,
                Number(transaction.amount),
                transaction.account_id,
                transaction.transfer_to_account_id as string
              )
            )
        );

        setExistingHashes(existingHashesSet);
        setExistingTransferFingerprints(existingTransferFingerprintsSet);

        const otherAccounts = accounts.filter((account) => account.id !== selectedAccount);

        const response = await fetch("/api/import/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            csvContent: text,
            categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
            labels: labels.map((label) => ({ id: label.id, name: label.name })),
            accounts: otherAccounts.map((account) => ({
              id: account.id,
              name: account.name,
              bank_name: account.bank_name,
              iban: account.iban,
              type: account.type,
            })),
            accountId: selectedAccount,
            selectedAccountName: currentAccount
              ? `${currentAccount.name}${currentAccount.bank_name ? ` (${currentAccount.bank_name})` : ""}`
              : selectedAccount,
            provider: parserProvider,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to parse file");
        }

        const { transactions: parsed } = await response.json();

        setTransactions(
          hydrateTransactions(
            parsed as ParsedTransactionDraft[],
            selectedAccount,
            existingHashesSet,
            existingTransferFingerprintsSet
          )
        );
        setStep("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
        setStep("upload");
      }
    },
    [
      selectedAccount,
      currentAccount,
      categories,
      labels,
      accounts,
      parserProvider,
      session?.access_token,
    ]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handleImport() {
    setError("");
    setStep("importing");
    const selected = transactions.filter((t) => t.selected);
    const preSkipped = transactions.length - selected.length;
    let importLogId: string | null = null;
    let useInsertFallback = false;

    try {
      const { data: importLog, error: importLogError } = await supabase
        .from("imports")
        .insert({
          filename: fileName,
          account_id: selectedAccount,
          status: "processing",
        })
        .select()
        .single();

      if (importLogError) {
        throw importLogError;
      }

      importLogId = importLog.id;

      let imported = 0;
      let failed = 0;
      let ignoredDuplicates = 0;
      const failureMessages: string[] = [];

      for (const transaction of selected) {
        if (transaction.type === "transfer" && transaction.duplicateSource === "existing") {
          ignoredDuplicates += 1;
          continue;
        }

        const transferAccounts = getTransferAccounts(transaction, selectedAccount);

        const row: PersistedTransactionRow = {
          account_id: transferAccounts?.account_id ?? selectedAccount,
          category_id: transaction.category_id,
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          notes: transaction.notes || null,
          date: transaction.date,
          transaction_hash: transaction.hash,
          transfer_to_account_id: transferAccounts?.transfer_to_account_id ?? null,
          import_id: importLogId,
        };

        let result;

        if (useInsertFallback) {
          result = await supabase.from("transactions").insert([row]).select("id");
        } else {
          result = await supabase
            .from("transactions")
            .upsert([row], {
              onConflict: "account_id,transaction_hash",
              ignoreDuplicates: true,
            })
            .select("id");
        }

        if (!useInsertFallback && isMissingOnConflictConstraint(result.error)) {
          useInsertFallback = true;
          result = await supabase.from("transactions").insert([row]).select("id");
        }

        if (isDuplicateKeyError(result.error)) {
          ignoredDuplicates += 1;
          continue;
        }

        if (result.error) {
          failed += 1;

          if (failureMessages.length < 3) {
            failureMessages.push(`${row.date} · ${row.description}: ${result.error.message}`);
          }

          continue;
        }

        const inserted = result.data?.[0];

        if (!inserted) {
          ignoredDuplicates += 1;
          continue;
        }

        imported += 1;

        if (transaction.label_ids.length > 0) {
          const { error: labelError } = await supabase.from("transaction_labels").insert(
            transaction.label_ids.map((labelId) => ({
              transaction_id: inserted.id,
              label_id: labelId,
            }))
          );

          if (labelError) {
            failed += 1;

            if (failureMessages.length < 3) {
              failureMessages.push(`${row.date} · ${row.description} labels: ${labelError.message}`);
            }
          }
        }
      }

      const skipped = preSkipped + ignoredDuplicates;
      const status = failed > 0 ? (imported > 0 ? "partial" : "failed") : "completed";

      await supabase
        .from("imports")
        .update({ rows_imported: imported, rows_skipped: skipped, status })
        .eq("id", importLogId);

      if (failed > 0 && imported === 0) {
        throw new Error(
          failureMessages[0] ?? "No transactions could be imported. Review the parsed rows and try again."
        );
      }

      setImportResult({
        imported,
        skipped,
      });

      if (failed > 0) {
        setError(
          `Imported ${imported} transaction(s). ${failed} row(s) failed: ${failureMessages.join(" | ")}`
        );
      }

      setStep("done");
    } catch (err) {
      if (importLogId) {
        await supabase
          .from("imports")
          .update({ status: "failed" })
          .eq("id", importLogId);
      }

      setError(err instanceof Error ? err.message : "Failed to import transactions");
      setStep("review");
    }
  }

  function toggleTransaction(index: number) {
    setTransactions((prev) =>
      prev.map((t, i) =>
        i === index && !t.validationError ? { ...t, selected: !t.selected } : t
      )
    );
  }

  function toggleAll() {
    const selectableTransactions = transactions.filter((t) => !t.validationError);
    const allSelected =
      selectableTransactions.length > 0 && selectableTransactions.every((t) => t.selected);

    setTransactions((prev) =>
      prev.map((t) => (t.validationError ? t : { ...t, selected: !allSelected }))
    );
  }

  function updateCategory(index: number, categoryId: string) {
    setTransactions((prev) =>
      hydrateTransactions(
        prev.map((t, i) =>
          i === index ? { ...t, category_id: categoryId || null } : t
        ),
        selectedAccount,
        existingHashes,
        existingTransferFingerprints
      )
    );
  }

  function updateType(index: number, type: "income" | "expense" | "transfer") {
    setTransactions((prev) =>
      hydrateTransactions(
        prev.map((t, i) => {
          if (i !== index) {
            return t;
          }

          const selectedAccountRole =
            type === "transfer"
              ? t.type === "income"
                ? "destination"
                : t.type === "expense"
                  ? "source"
                  : t.selected_account_role
              : null;

          return {
            ...t,
            type,
            category_id: type === "transfer" ? null : t.category_id,
            transfer_account_id: type === "transfer" ? t.transfer_account_id : null,
            selected_account_role: selectedAccountRole,
          };
        }),
        selectedAccount,
        existingHashes,
        existingTransferFingerprints
      )
    );
  }

  function updateTransferAccount(index: number, transferAccountId: string) {
    setTransactions((prev) =>
      hydrateTransactions(
        prev.map((t, i) =>
          i === index ? { ...t, transfer_account_id: transferAccountId || null } : t
        ),
        selectedAccount,
        existingHashes,
        existingTransferFingerprints
      )
    );
  }

  function updateTransferRole(index: number, role: TransferRole) {
    setTransactions((prev) =>
      hydrateTransactions(
        prev.map((t, i) =>
          i === index ? { ...t, selected_account_role: role } : t
        ),
        selectedAccount,
        existingHashes,
        existingTransferFingerprints
      )
    );
  }

  function updateLabels(index: number, labelIds: string[]) {
    setTransactions((prev) =>
      hydrateTransactions(
        prev.map((t, i) =>
          i === index ? { ...t, label_ids: labelIds } : t
        ),
        selectedAccount,
        existingHashes,
        existingTransferFingerprints
      )
    );
  }

  function reset() {
    setStep("upload");
    setTransactions([]);
    setExistingHashes(new Set());
    setExistingTransferFingerprints(new Set());
    setFileName("");
    setError("");
    setEditingBalance(false);

    if (currentAccountBalance !== null) {
      setBalanceOverride(String(currentAccountBalance));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-label text-[11px] text-[var(--color-secondary)]">Ledger</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--color-primary)] sm:text-3xl">
          Import Transactions
        </h1>
      </div>

      {error && (
        <div className="notice notice-danger flex items-center gap-2">
          <XCircle size={16} />
          {error}
        </div>
      )}

      {step === "upload" && (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                Import into Account
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="field max-w-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank_name ?? a.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">
                Parser
              </label>
              <select
                value={parserProvider}
                onChange={(e) => setParserProvider(e.target.value as ParserProvider)}
                className="field max-w-sm"
              >
                <option value="gemini">Gemini</option>
                <option value="ollama-gemma">Ollama Gemma (gemma3:4b)</option>
                <option value="ollama-qwen">Ollama Qwen (qwen3:8b)</option>
              </select>
              <p className="mt-1 text-xs text-[var(--color-secondary)]">
                {parserOptions[parserProvider].description}
              </p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors sm:p-12 ${
                dragOver
                  ? "border-[var(--color-tertiary)] bg-[rgba(184,66,46,0.06)]"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-secondary)]"
              }`}
            >
              <Upload className="mb-4 h-10 w-10 text-[var(--color-secondary)] sm:h-12 sm:w-12" />
              <p className="mb-2 text-sm font-medium text-[var(--color-primary)]">
                Drop your CSV file here
              </p>
              <p className="mb-4 text-xs text-[var(--color-secondary)]">
                or click to browse. Supports CSV exports from most banks.
              </p>
              <label className="btn btn-primary cursor-pointer">
                Browse Files
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>

            <div className="notice notice-info">
              <p className="font-medium">How it works</p>
              <ol className="mt-1 list-inside list-decimal space-y-1 text-xs">
                <li>Select the account to import into</li>
                <li>Choose Gemini, Ollama Gemma, or Ollama Qwen as the parser</li>
                <li>Drop your bank CSV export file</li>
                <li>The selected parser analyzes and categorizes each transaction</li>
                <li>Review, adjust categories, and confirm</li>
              </ol>
            </div>
          </div>
        </Card>
      )}

      {step === "parsing" && (
        <Card>
          <div className="flex flex-col items-center py-12">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-[var(--color-tertiary)]" />
            <p className="font-medium text-[var(--color-primary)]">
              Analyzing your file with {parserLabel}...
            </p>
            <p className="mt-1 text-sm text-[var(--color-secondary)]">
              Parsing {fileName} and categorizing transactions with {parserLabel}
            </p>
          </div>
        </Card>
      )}

      {step === "review" && (
        <>
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-[var(--color-tertiary)]" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-primary)]">{fileName}</p>
                  <p className="text-xs text-[var(--color-secondary)]">
                    {transactions.length} transactions found ·{" "}
                    {transactions.filter((t) => t.selected).length} selected
                  </p>
                  {currentAccount && (
                    <p className="mt-0.5 text-xs font-medium text-[var(--color-tertiary)]">
                      → Importing into: {currentAccount.name}
                      {currentAccount.bank_name ? ` (${currentAccount.bank_name})` : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={reset} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={transactions.filter((t) => t.selected).length === 0}
                  className="btn btn-primary"
                >
                  Import {transactions.filter((t) => t.selected).length} Transactions
                </button>
              </div>
            </div>
            {projectedBalance !== null && currentAccount && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--color-border)] pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-[var(--color-secondary)]">
                  Saldo actual:&nbsp;
                  {editingBalance ? (
                    <input
                      type="number"
                      step="0.01"
                      value={balanceOverride}
                      onChange={(e) => setBalanceOverride(e.target.value)}
                      onBlur={() => setEditingBalance(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingBalance(false);
                      }}
                      autoFocus
                      className="field w-28 px-2 py-0.5 text-sm font-medium"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingBalance(true)}
                      title="Haz clic para corregir el saldo actual"
                      className="font-medium text-[var(--color-primary)] underline decoration-dashed underline-offset-2 hover:text-[var(--color-tertiary)]"
                    >
                      {formatCurrency(baseBalance)}
                    </button>
                  )}
                  <span className="text-xs text-[var(--color-secondary)]">(editable)</span>
                </span>
                <span className="text-[var(--color-secondary)]">→</span>
                <span className="text-[var(--color-secondary)]">
                  Saldo proyectado:{" "}
                  <span
                    className={`font-semibold ${projectedBalance >= 0 ? "amount-pos" : "amount-neg"}`}
                  >
                    {formatCurrency(projectedBalance)}
                  </span>
                </span>
                {(() => {
                  const delta = projectedBalance - baseBalance;
                  return delta !== 0 ? (
                    <span className={`text-xs ${delta > 0 ? "amount-pos" : "amount-neg"}`}>
                      ({delta > 0 ? "+" : ""}
                      {formatCurrency(delta)})
                    </span>
                  ) : null;
                })()}
              </div>
            )}
          </Card>

          {transactions.some((tx) => tx.duplicateSource) && (
            <div className="notice notice-warning flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <p className="font-medium">Duplicate transactions detected</p>
                <p className="mt-1">
                  Existing duplicates and duplicate rows within the uploaded file are unselected automatically.
                </p>
              </div>
            </div>
          )}

          <Card className="overflow-x-auto p-0!">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        transactions.filter((t) => !t.validationError).length > 0 &&
                        transactions.filter((t) => !t.validationError).every((t) => t.selected)
                      }
                      onChange={toggleAll}
                      className="rounded-sm"
                    />
                  </th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Date</th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Description</th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Status</th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Type</th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Transfer</th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Category</th>
                  <th className="font-label px-4 py-3 text-[11px] text-[var(--color-secondary)]">Labels</th>
                  <th className="font-label px-4 py-3 text-right text-[11px] text-[var(--color-secondary)]">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {transactions.map((tx, i) => (
                  <tr
                    key={i}
                    className={tx.selected ? "" : "bg-[rgba(26,28,30,0.02)] opacity-60"}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={tx.selected}
                        disabled={Boolean(tx.validationError)}
                        onChange={() => toggleTransaction(i)}
                        className="rounded-sm"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-secondary)]">
                      {tx.date}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-primary)]">{tx.description}</p>
                      {tx.notes && (
                        <p className="text-xs text-[var(--color-secondary)]">{tx.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tx.validationError ? (
                        <span className="chip chip-warning">{tx.validationError}</span>
                      ) : tx.duplicateSource ? (
                        <span className="chip chip-warning">
                          {tx.type === "transfer" && tx.duplicateSource === "existing"
                            ? "Already reflected"
                            : tx.duplicateSource === "existing"
                              ? "Already imported"
                              : "Repeated in file"}
                        </span>
                      ) : (
                        <span className="chip chip-success">New</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tx.type}
                        onChange={(e) =>
                          updateType(i, e.target.value as "income" | "expense" | "transfer")
                        }
                        className={`rounded-sm border px-2 py-1 text-xs font-medium ${TYPE_SELECT_CLASS[tx.type]}`}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {tx.type === "transfer" ? (
                        <div className="space-y-2">
                          <select
                            value={tx.transfer_account_id ?? ""}
                            onChange={(e) => updateTransferAccount(i, e.target.value)}
                            className="field min-w-40 px-2 py-1 text-xs"
                          >
                            <option value="">Select account</option>
                            {accounts
                              .filter((account) => account.id !== selectedAccount)
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                          </select>
                          <select
                            value={tx.selected_account_role ?? "source"}
                            onChange={(e) => updateTransferRole(i, e.target.value as TransferRole)}
                            className="field min-w-32 px-2 py-1 text-xs"
                          >
                            <option value="source">Outgoing</option>
                            <option value="destination">Incoming</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--color-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tx.category_id ?? ""}
                        onChange={(e) => updateCategory(i, e.target.value)}
                        className="field px-2 py-1 text-xs"
                      >
                        <option value="">None</option>
                        {categories
                          .filter((c) => c.type === tx.type)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                      {tx.category_id && (
                        <p className="font-label mt-1 text-[10px] text-[var(--color-tertiary)]">
                          AI suggestion
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <LabelMultiSelect
                        labels={labels}
                        selectedIds={tx.label_ids}
                        onChange={(labelIds) => updateLabels(i, labelIds)}
                      />
                      {tx.label_ids.length > 0 && (
                        <p className="font-label mt-1 text-[10px] text-[var(--color-tertiary)]">
                          Suggested labels
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      <span
                        className={
                          tx.type === "income"
                            ? "amount-pos"
                            : tx.type === "expense"
                              ? "amount-neg"
                              : tx.selected_account_role === "destination"
                                ? "amount-pos"
                                : "amount-transfer"
                        }
                      >
                        {tx.type === "income"
                          ? "+"
                          : tx.type === "expense"
                            ? "-"
                            : tx.selected_account_role === "destination"
                              ? "+"
                              : "→"}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {step === "importing" && (
        <Card>
          <div className="flex flex-col items-center py-12">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-[var(--color-tertiary)]" />
            <p className="font-medium text-[var(--color-primary)]">Importing transactions...</p>
          </div>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <div className="flex flex-col items-center py-12">
            <CheckCircle2 className="mb-4 h-12 w-12 text-[var(--color-success)]" />
            <p className="text-lg font-semibold text-[var(--color-primary)]">Import Complete!</p>
            <p className="mt-1 text-sm text-[var(--color-secondary)]">
              {importResult.imported} transactions imported
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={reset} className="btn btn-secondary">
                Import More
              </button>
              <a href="/transactions" className="btn btn-primary">
                View Transactions
              </a>
            </div>
          </div>
        </Card>
      )}

      <ImportHistory />
    </div>
  );
}

function ImportHistory() {
  const [imports, setImports] = useState<
    {
      id: string;
      filename: string;
      rows_imported: number;
      rows_skipped: number;
      status: string;
      created_at: string;
      accounts: { name: string } | null;
    }[]
  >([]);

  useEffect(() => {
    supabase
      .from("imports")
      .select("*, accounts(name)")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setImports(data as typeof imports);
      });
  }, []);

  if (imports.length === 0) return null;

  return (
    <Card>
      <h3 className="font-label mb-4 text-[11px] text-[var(--color-secondary)]">Recent Imports</h3>
      <div className="space-y-2">
        {imports.map((imp) => (
          <div
            key={imp.id}
            className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-4 py-2"
          >
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-[var(--color-secondary)]" />
              <div>
                <p className="text-sm font-medium text-[var(--color-primary)]">{imp.filename}</p>
                <p className="text-xs text-[var(--color-secondary)]">
                  {imp.accounts?.name} · {imp.rows_imported} imported
                  {imp.rows_skipped > 0 ? ` · ${imp.rows_skipped} skipped` : ""}
                  {imp.status !== "completed" ? ` · ${imp.status}` : ""}
                  {` · ${formatDate(imp.created_at)}`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
