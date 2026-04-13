"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { createTransactionHash, formatCurrency, formatDate } from "@/lib/utils";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import type { Account, Category } from "@/lib/database.types";

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id: string | null;
  notes: string;
  hash: string;
  duplicateSource: "existing" | "file" | null;
  selected: boolean;
}

type ParserProvider = "gemini" | "ollama";

type ImportStep = "upload" | "parsing" | "review" | "importing" | "done";

export default function ImportPage() {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [parserProvider, setParserProvider] = useState<ParserProvider>("gemini");
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0 });
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const parserLabel = parserProvider === "ollama" ? "Ollama Gemma" : "Gemini";

  const currentAccount = accounts.find((a) => a.id === selectedAccount);
  const projectedBalance = currentAccount
    ? currentAccount.current_balance +
      transactions
        .filter((t) => t.selected)
        .reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0)
    : null;

  useEffect(() => {
    async function load() {
      const [{ data: accts }, { data: cats }] = await Promise.all([
        supabase.from("accounts").select("*").eq("is_active", true).order("name"),
        supabase.from("categories").select("*").order("name"),
      ]);
      if (accts) {
        setAccounts(accts);
        if (accts.length > 0) setSelectedAccount(accts[0].id);
      }
      if (cats) setCategories(cats);
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

      // Read and parse CSV
      const text = await file.text();

      // Quick pre-parse to check if it looks like CSV
      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        setError("File appears empty or has only headers");
        return;
      }

      setStep("parsing");

      try {
        const { data: existingTransactions } = await supabase
          .from("transactions")
          .select("date, description, amount, type")
          .eq("account_id", selectedAccount);

        const existingHashes = new Set(
          (existingTransactions ?? []).map((transaction) =>
            createTransactionHash({
              date: transaction.date,
              type: transaction.type,
              amount: Number(transaction.amount),
              description: transaction.description,
            })
          )
        );

        const response = await fetch("/api/import/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            csvContent: text,
            categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
            accountId: selectedAccount,
            provider: parserProvider,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to parse file");
        }

        const { transactions: parsed } = await response.json();

        const seenHashes = new Set<string>();

        setTransactions(
          parsed.map((t: Omit<ParsedTransaction, "selected" | "hash" | "duplicateSource">) => {
            const hash = createTransactionHash({
              date: t.date,
              type: t.type,
              amount: t.amount,
              description: t.description,
            });

            const duplicateSource = existingHashes.has(hash)
              ? "existing"
              : seenHashes.has(hash)
                ? "file"
                : null;

            seenHashes.add(hash);

            return {
              ...t,
              hash,
              duplicateSource,
              selected: duplicateSource === null,
            };
          })
        );
        setStep("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
        setStep("upload");
      }
    },
    [selectedAccount, categories, parserProvider, session?.access_token]
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
    setStep("importing");
    const selected = transactions.filter((t) => t.selected);

    // Create import log
    const { data: importLog } = await supabase
      .from("imports")
      .insert({
        filename: fileName,
        account_id: selectedAccount,
        status: "processing",
      })
      .select()
      .single();

    // Insert transactions in batches
    const batchSize = 50;
    let imported = 0;

    for (let i = 0; i < selected.length; i += batchSize) {
      const batch = selected.slice(i, i + batchSize).map((t) => ({
        account_id: selectedAccount,
        category_id: t.category_id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        notes: t.notes || null,
        date: t.date,
        transaction_hash: t.hash,
        import_id: importLog?.id ?? null,
      }));

      const { data, error } = await supabase
        .from("transactions")
        .upsert(batch, {
          onConflict: "account_id,transaction_hash",
          ignoreDuplicates: true,
        })
        .select("id");

      if (!error) imported += data?.length ?? 0;
    }

    const skipped = transactions.length - imported;

    if (importLog) {
      await supabase
        .from("imports")
        .update({ rows_imported: imported, rows_skipped: skipped, status: "completed" })
        .eq("id", importLog.id);
    }

    setImportResult({
      imported,
      skipped,
    });
    setStep("done");
  }

  function toggleTransaction(index: number) {
    setTransactions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  }

  function toggleAll() {
    const allSelected = transactions.every((t) => t.selected);
    setTransactions((prev) => prev.map((t) => ({ ...t, selected: !allSelected })));
  }

  function updateCategory(index: number, categoryId: string) {
    setTransactions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, category_id: categoryId || null } : t))
    );
  }

  function updateType(index: number, type: "income" | "expense") {
    setTransactions((prev) =>
      prev.map((t, i) => (i === index ? { ...t, type } : t))
    );
  }

  function reset() {
    setStep("upload");
    setTransactions([]);
    setFileName("");
    setError("");
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <h1 className="text-2xl font-bold text-gray-900">Import Transactions</h1>

      {/* Account selection */}
      {step === "upload" && (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Import into Account
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank_name ?? a.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Parser
              </label>
              <select
                value={parserProvider}
                onChange={(e) => setParserProvider(e.target.value as ParserProvider)}
                className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="gemini">Gemini</option>
                <option value="ollama">Ollama Gemma</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {parserProvider === "ollama"
                  ? "Uses your local Ollama model at http://localhost:11434 (default: gemma3:4b)."
                  : "Uses Google Gemini via GEMINI_API_KEY on the server."}
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
                dragOver
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className="mb-4 h-12 w-12 text-gray-400" />
              <p className="mb-2 text-sm font-medium text-gray-700">
                Drop your CSV file here
              </p>
              <p className="mb-4 text-xs text-gray-500">
                or click to browse. Supports CSV exports from most banks.
              </p>
              <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Browse Files
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <XCircle size={16} />
                {error}
              </div>
            )}

            <div className="rounded-lg bg-blue-50 px-4 py-3">
              <p className="text-sm font-medium text-blue-800">How it works</p>
              <ol className="mt-1 list-inside list-decimal text-xs text-blue-700 space-y-1">
                <li>Select the account to import into</li>
                <li>Choose Gemini or Ollama Gemma as the parser</li>
                <li>Drop your bank CSV export file</li>
                <li>The selected parser analyzes and categorizes each transaction</li>
                <li>Review, adjust categories, and confirm</li>
              </ol>
            </div>
          </div>
        </Card>
      )}

      {/* Parsing state */}
      {step === "parsing" && (
        <Card>
          <div className="flex flex-col items-center py-12">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-indigo-600" />
            <p className="font-medium text-gray-900">Analyzing your file with {parserLabel}...</p>
            <p className="mt-1 text-sm text-gray-500">
              Parsing {fileName} and categorizing transactions with {parserLabel}
            </p>
          </div>
        </Card>
      )}

      {/* Review state */}
      {step === "review" && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-indigo-500" />
                <div>
                  <p className="font-medium text-gray-900">{fileName}</p>
                  <p className="text-xs text-gray-500">
                    {transactions.length} transactions found ·{" "}
                    {transactions.filter((t) => t.selected).length} selected
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={transactions.filter((t) => t.selected).length === 0}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Import {transactions.filter((t) => t.selected).length} Transactions
                </button>
              </div>
            </div>
            {projectedBalance !== null && currentAccount && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-gray-100 pt-3 text-sm">
                <span className="text-gray-500">
                  Saldo actual:{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(currentAccount.current_balance)}
                  </span>
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-500">
                  Saldo proyectado:{" "}
                  <span className={`font-semibold ${projectedBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(projectedBalance)}
                  </span>
                </span>
                {(() => {
                  const delta = projectedBalance - currentAccount.current_balance;
                  return delta !== 0 ? (
                    <span className={`text-xs ${delta > 0 ? "text-green-500" : "text-red-500"}`}>
                      ({delta > 0 ? "+" : ""}{formatCurrency(delta)})
                    </span>
                  ) : null;
                })()}
              </div>
            )}
          </Card>

          {transactions.some((tx) => tx.duplicateSource) && (
            <Card>
              <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
                <div>
                  <p className="font-medium">Duplicate transactions detected</p>
                  <p className="mt-1 text-amber-700">
                    Existing duplicates and duplicate rows within the uploaded file are unselected automatically.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card className="overflow-x-auto p-0!">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={transactions.every((t) => t.selected)}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx, i) => (
                  <tr
                    key={i}
                    className={`${tx.selected ? "bg-white" : "bg-gray-50 opacity-60"}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={tx.selected}
                        onChange={() => toggleTransaction(i)}
                        className="rounded"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {tx.date}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{tx.description}</p>
                      {tx.notes && <p className="text-xs text-gray-400">{tx.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {tx.duplicateSource ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                          {tx.duplicateSource === "existing" ? "Already imported" : "Repeated in file"}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          New
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tx.type}
                        onChange={(e) => updateType(i, e.target.value as "income" | "expense")}
                        className={`rounded border px-2 py-1 text-xs font-medium ${
                          tx.type === "income"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tx.category_id ?? ""}
                        onChange={(e) => updateCategory(i, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs"
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
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      <span className={tx.type === "income" ? "text-green-600" : "text-red-600"}>
                        {tx.type === "income" ? "+" : "-"}
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

      {/* Importing state */}
      {step === "importing" && (
        <Card>
          <div className="flex flex-col items-center py-12">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-indigo-600" />
            <p className="font-medium text-gray-900">Importing transactions...</p>
          </div>
        </Card>
      )}

      {/* Done state */}
      {step === "done" && (
        <Card>
          <div className="flex flex-col items-center py-12">
            <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
            <p className="text-lg font-semibold text-gray-900">Import Complete!</p>
            <p className="mt-1 text-sm text-gray-500">
              {importResult.imported} transactions imported
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={reset}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Import More
              </button>
              <a
                href="/transactions"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                View Transactions
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* Import History */}
      <ImportHistory />
    </div>
  );
}

function ImportHistory() {
  const [imports, setImports] = useState<
    { id: string; filename: string; rows_imported: number; rows_skipped: number; created_at: string; accounts: { name: string } | null }[]
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
      <h3 className="mb-4 text-sm font-medium text-gray-500">Recent Imports</h3>
      <div className="space-y-2">
        {imports.map((imp) => (
          <div key={imp.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{imp.filename}</p>
                <p className="text-xs text-gray-500">
                  {imp.accounts?.name} · {imp.rows_imported} imported · {formatDate(imp.created_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
