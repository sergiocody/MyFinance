"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { LabelMultiSelect } from "@/components/LabelMultiSelect";
import Modal from "@/components/Modal";
import { createTransactionHash, formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Filter,
  Landmark,
  Pencil,
  Plus,
  RotateCcw,
  Tags,
  Trash2,
} from "lucide-react";
import type { Account, Category, Label, TransactionWithRelations } from "@/lib/database.types";

const PAGE_SIZE = 20;

type TransactionFlowType = "expense" | "income" | "transfer";
type ComposerMode = "create" | "edit" | "duplicate";
type MobileFilterPicker = "account" | "category" | null;

const FILTER_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

const TRANSACTION_TYPE_OPTIONS = [
  {
    value: "expense",
    label: "Expense",
    hint: "Money out",
    icon: ArrowUpRight,
    activeClassName: "border-rose-200 bg-rose-50 text-rose-700",
    iconClassName: "bg-rose-100 text-rose-600",
  },
  {
    value: "income",
    label: "Income",
    hint: "Money in",
    icon: ArrowDownLeft,
    activeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    iconClassName: "bg-emerald-100 text-emerald-600",
  },
  {
    value: "transfer",
    label: "Transfer",
    hint: "Move funds",
    icon: ArrowRightLeft,
    activeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    iconClassName: "bg-sky-100 text-sky-600",
  },
] as const;

const FLOW_CONTENT: Record<
  TransactionFlowType,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: string[];
    descriptionLabel: string;
    descriptionPlaceholder: string;
    amountLabel: string;
    accountSectionTitle: string;
    accountSectionDescription: string;
    accountLabel: string;
    destinationLabel: string;
    accountHint: string;
    categorySectionTitle: string;
    categorySectionDescription: string;
    categoryLabel: string;
    labelsLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    submitLabel: string;
  }
> = {
  expense: {
    eyebrow: "Expense Flow",
    title: "Record an expense",
    subtitle: "Capture what you spent, where it came from, and optionally organize it.",
    steps: ["What happened", "Paid from", "Organize"],
    descriptionLabel: "What was it for?",
    descriptionPlaceholder: "Groceries, coffee, utilities, rent...",
    amountLabel: "Amount spent",
    accountSectionTitle: "Payment account",
    accountSectionDescription: "Choose the account or wallet that paid for this expense.",
    accountLabel: "Paid from",
    destinationLabel: "Destination",
    accountHint: "This expense will reduce the selected account balance.",
    categorySectionTitle: "Categorize expense",
    categorySectionDescription: "Keep it simple now, so reports stay clean later.",
    categoryLabel: "Expense category",
    labelsLabel: "Expense labels",
    notesLabel: "Notes",
    notesPlaceholder: "Add a reminder, merchant, or context if useful.",
    submitLabel: "Save expense",
  },
  income: {
    eyebrow: "Income Flow",
    title: "Register income",
    subtitle: "Log incoming money, select where it lands, and classify it if needed.",
    steps: ["Source", "Deposit into", "Classify"],
    descriptionLabel: "Where did it come from?",
    descriptionPlaceholder: "Salary, invoice, refund, interest...",
    amountLabel: "Amount received",
    accountSectionTitle: "Destination account",
    accountSectionDescription: "Choose the account where this income is deposited.",
    accountLabel: "Deposit into",
    destinationLabel: "Destination",
    accountHint: "This income will increase the selected account balance.",
    categorySectionTitle: "Classify income",
    categorySectionDescription: "Use a category or labels only if they help later reporting.",
    categoryLabel: "Income category",
    labelsLabel: "Income labels",
    notesLabel: "Notes",
    notesPlaceholder: "Optional details such as client, invoice number, or source.",
    submitLabel: "Save income",
  },
  transfer: {
    eyebrow: "Transfer Flow",
    title: "Move money between accounts",
    subtitle: "Pick the source, pick the destination, and save. The rest is optional.",
    steps: ["Amount", "From and to", "Optional details"],
    descriptionLabel: "Transfer note",
    descriptionPlaceholder: "Savings top-up, card repayment, cash withdrawal...",
    amountLabel: "Amount moved",
    accountSectionTitle: "Transfer accounts",
    accountSectionDescription: "Select the source account first, then the destination account.",
    accountLabel: "Move from",
    destinationLabel: "Move to",
    accountHint: "Transfers decrease one account and increase the other.",
    categorySectionTitle: "Optional details",
    categorySectionDescription: "Transfers usually only need the amount and both accounts.",
    categoryLabel: "Transfer category",
    labelsLabel: "Transfer labels",
    notesLabel: "Notes",
    notesPlaceholder: "Optional context such as why you moved the funds.",
    submitLabel: "Save transfer",
  },
};

function normalizeFlowType(value: string | null): TransactionFlowType {
  if (value === "income" || value === "transfer") {
    return value;
  }

  return "expense";
}

function buildEmptyForm(accounts: Account[], type: TransactionFlowType) {
  return {
    account_id: accounts[0]?.id ?? "",
    category_id: "",
    type,
    amount: "",
    description: "",
    notes: "",
    date: new Date().toISOString().split("T")[0],
    label_ids: [] as string[],
    transfer_to_account_id: "",
  };
}

export default function TransactionsPage() {
  type TransactionFilterType = "" | "income" | "expense" | "transfer";
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountParam = searchParams.get("account") ?? "";
  const composeFlow = normalizeFlowType(searchParams.get("flow"));
  const shouldOpenComposer = searchParams.get("new") === "1";

  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>("create");
  const [mobileFilterPicker, setMobileFilterPicker] = useState<MobileFilterPicker>(null);
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

  useEffect(() => {
    if (!shouldOpenComposer || modalOpen || accounts.length === 0) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(null);
    setComposerMode("create");
    setFormError("");
    setForm(buildEmptyForm(accounts, composeFlow));
    setModalOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.delete("flow");
    const nextQuery = params.toString();

    router.replace(nextQuery ? `/transactions?${nextQuery}` : "/transactions", {
      scroll: false,
    });
  }, [accounts, composeFlow, modalOpen, router, searchParams, shouldOpenComposer]);

  function openCreate(type: TransactionFlowType = "expense") {
    setComposerMode("create");
    setEditing(null);
    setFormError("");
    setForm(buildEmptyForm(accounts, type));
    setModalOpen(true);
  }

  function openEdit(tx: TransactionWithRelations) {
    setComposerMode("edit");
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

  function openDuplicate(tx: TransactionWithRelations) {
    setComposerMode("duplicate");
    setEditing(null);
    setFormError("");
    setForm({
      account_id: tx.account_id,
      category_id: tx.category_id ?? "",
      type: tx.type,
      amount: String(tx.amount),
      description: tx.description ?? "",
      notes: tx.notes ?? "",
      date: tx.date,
      label_ids: tx.transaction_labels?.map((transactionLabel) => transactionLabel.labels.id) ?? [],
      transfer_to_account_id: tx.transfer_to_account_id ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const amount = parseFloat(form.amount);
    if (!amount || !form.account_id) {
      setFormError("Add an amount and select an account.");
      return;
    }

    if (form.type === "transfer" && !form.transfer_to_account_id) {
      setFormError("Choose the destination account for this transfer.");
      return;
    }

    if (form.type === "transfer" && form.transfer_to_account_id === form.account_id) {
      setFormError("Origin and destination accounts must be different.");
      return;
    }

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
          ? composerMode === "duplicate"
            ? "This copy matches an existing transaction exactly. Change at least one key detail before saving it as a new row."
            : "A matching transaction already exists for this account."
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

  function resetFilters() {
    setFilterAccount("");
    setFilterCategory("");
    setFilterType("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(0);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const filteredCategories = categories.filter((category) => category.type === form.type);
  const selectedAccount = accounts.find((account) => account.id === form.account_id);
  const selectedDestinationAccount = accounts.find(
    (account) => account.id === form.transfer_to_account_id
  );
  const fieldClassName =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
  const sectionClassName = "rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
  const currentFlow = FLOW_CONTENT[form.type];
  const actionIconButtonClass =
    "rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600";
  const mobileActionButtonClass =
    "inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900";
  const filterChipButtonClass =
    "inline-flex items-center justify-center rounded-2xl border px-3 py-2 text-sm font-medium transition";
  const mobilePickerButtonClass =
    "flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:border-slate-300 hover:bg-slate-50";
  const activeFilterCount = [
    filterAccount,
    filterCategory,
    filterType,
    filterDateFrom,
    filterDateTo,
  ].filter(Boolean).length;
  const activeFilterSummary = [
    filterAccount ? `Account: ${accounts.find((account) => account.id === filterAccount)?.name ?? "Selected"}` : null,
    filterCategory ? `Category: ${categories.find((category) => category.id === filterCategory)?.name ?? "Selected"}` : null,
    filterType ? `Type: ${filterType}` : null,
    filterDateFrom ? `From ${formatDate(filterDateFrom)}` : null,
    filterDateTo ? `To ${formatDate(filterDateTo)}` : null,
  ].filter((value): value is string => Boolean(value));
  const selectedFilterAccountName = filterAccount
    ? accounts.find((account) => account.id === filterAccount)?.name ?? "Selected account"
    : "All accounts";
  const selectedFilterCategoryName = filterCategory
    ? categories.find((category) => category.id === filterCategory)?.name ?? "Selected category"
    : "All categories";
  const composerTitle =
    composerMode === "edit"
      ? "Edit Transaction"
      : composerMode === "duplicate"
        ? "Copy Transaction"
        : "New Transaction";
  const composerHeading =
    composerMode === "edit"
      ? `Update ${form.type}`
      : composerMode === "duplicate"
        ? `Copy ${form.type}`
        : currentFlow.title;
  const composerSubtitle =
    composerMode === "edit"
      ? "Adjust the transaction details and save your changes."
      : composerMode === "duplicate"
        ? "This form starts with the same values as the selected row. Review and save it as a new transaction."
        : currentFlow.subtitle;
  const composerSubmitLabel =
    composerMode === "edit"
      ? "Save changes"
      : composerMode === "duplicate"
        ? "Create copied transaction"
        : currentFlow.submitLabel;

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <p className="mt-1 text-sm text-gray-500">
              Browse the ledger, then refine it with quick mobile-friendly filters.
            </p>
          </div>

          {!showFilters && activeFilterSummary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterSummary.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Filter size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => openCreate("expense")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus size={16} />
            New expense
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-label text-[11px] text-slate-500">Refine List</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Filters</h2>
              <p className="mt-1 text-sm text-slate-500">
                Results update instantly as you narrow down the list.
              </p>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label className="font-label block text-[11px] text-slate-500">Type</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FILTER_TYPE_OPTIONS.map((option) => {
                const isActive = filterType === option.value;

                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      setFilterType(option.value as TransactionFilterType);
                      setPage(0);
                    }}
                    className={`${filterChipButtonClass} ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="font-label mb-2 block text-[11px] text-slate-500">Account</label>
              <button
                type="button"
                onClick={() => setMobileFilterPicker("account")}
                className={`${mobilePickerButtonClass} sm:hidden`}
              >
                <span>{selectedFilterAccountName}</span>
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Choose</span>
              </button>
              <select
                value={filterAccount}
                onChange={(e) => { setFilterAccount(e.target.value); setPage(0); }}
                className={`${fieldClassName} hidden sm:block`}
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-label mb-2 block text-[11px] text-slate-500">Category</label>
              <button
                type="button"
                onClick={() => setMobileFilterPicker("category")}
                className={`${mobilePickerButtonClass} sm:hidden`}
              >
                <span>{selectedFilterCategoryName}</span>
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Choose</span>
              </button>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
                className={`${fieldClassName} hidden sm:block`}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-label mb-2 block text-[11px] text-slate-500">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
                className={fieldClassName}
              />
            </div>

            <div>
              <label className="font-label mb-2 block text-[11px] text-slate-500">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }}
                className={fieldClassName}
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
        <div className="md:hidden">
          {loading ? (
            <div className="px-4 py-8 text-center text-gray-400">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">No transactions found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="space-y-4 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {tx.description || "Untitled transaction"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">{formatDate(tx.date)}</p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        tx.type === "income"
                          ? "text-green-600"
                          : tx.type === "expense"
                            ? "text-red-600"
                            : "text-blue-600"
                      }`}
                    >
                      {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                      {formatCurrency(Number(tx.amount))}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium uppercase tracking-[0.14em] text-gray-400">Account</span>
                      <div className="flex items-center gap-2 text-gray-600">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: tx.accounts?.color }}
                        />
                        <span>{tx.accounts?.name ?? "-"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium uppercase tracking-[0.14em] text-gray-400">Category</span>
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
                        <span className="text-gray-400">-</span>
                      )}
                    </div>

                    {tx.transaction_labels && tx.transaction_labels.length > 0 && (
                      <div className="space-y-2">
                        <span className="block text-xs font-medium uppercase tracking-[0.14em] text-gray-400">
                          Labels
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {tx.transaction_labels.map((transactionLabel) => (
                            <span
                              key={transactionLabel.labels.id}
                              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: transactionLabel.labels.color + "20",
                                color: transactionLabel.labels.color,
                              }}
                            >
                              {transactionLabel.labels.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {tx.notes && (
                      <div className="space-y-1">
                        <span className="block text-xs font-medium uppercase tracking-[0.14em] text-gray-400">
                          Notes
                        </span>
                        <p className="text-xs text-gray-500">{tx.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => openDuplicate(tx)}
                      className={mobileActionButtonClass}
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => openEdit(tx)}
                      className={mobileActionButtonClass}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <table className="hidden w-full text-sm md:table">
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
                        onClick={() => openDuplicate(tx)}
                        className={actionIconButtonClass}
                        aria-label="Copy transaction"
                        title="Copy transaction"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(tx)}
                        className={actionIconButtonClass}
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
        title={composerTitle}
        size="lg"
        mobileSheet
        bodyClassName="p-0"
      >
        <form onSubmit={handleSave} className="flex h-full flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)]">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.16),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {currentFlow.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                    {composerHeading}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {composerSubtitle}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(form.date)}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {TRANSACTION_TYPE_OPTIONS.map((option) => {
                  const Icon = option.icon;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          type: option.value,
                          category_id: "",
                          transfer_to_account_id:
                            option.value === "transfer" ? form.transfer_to_account_id : "",
                        })
                      }
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        form.type === option.value
                          ? option.activeClassName
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <span className={`mb-3 inline-flex rounded-2xl p-2 ${option.iconClassName}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-1 block text-[11px] text-current/75">{option.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {currentFlow.steps.map((step, index) => (
                  <span
                    key={`${currentFlow.eyebrow}-${step}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                      {index + 1}
                    </span>
                    {step}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {currentFlow.descriptionLabel}
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${fieldClassName} text-base`}
                    placeholder={currentFlow.descriptionPlaceholder}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {currentFlow.amountLabel}
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">
                        €
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        required
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        className={`${fieldClassName} pl-9 text-3xl font-semibold tracking-tight`}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className={fieldClassName}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className={sectionClassName}>
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-2xl bg-slate-100 p-2.5 text-slate-600">
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{currentFlow.accountSectionTitle}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {currentFlow.accountSectionDescription}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {currentFlow.accountLabel}
                  </label>
                  <select
                    required
                    value={form.account_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        account_id: e.target.value,
                        transfer_to_account_id:
                          e.target.value === form.transfer_to_account_id ? "" : form.transfer_to_account_id,
                      })
                    }
                    className={fieldClassName}
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {selectedAccount && (
                    <p className="mt-2 text-xs text-slate-500">
                      {currentFlow.accountHint} Current selection: {selectedAccount.name}
                    </p>
                  )}
                </div>

                {form.type === "transfer" ? (
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {currentFlow.destinationLabel}
                    </label>
                    <select
                      value={form.transfer_to_account_id}
                      onChange={(e) => setForm({ ...form, transfer_to_account_id: e.target.value })}
                      className={fieldClassName}
                    >
                      <option value="">Select destination</option>
                      {accounts
                        .filter((account) => account.id !== form.account_id)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                    </select>
                    {selectedDestinationAccount && (
                      <p className="mt-2 text-xs text-slate-500">
                        Funds move to {selectedDestinationAccount.name}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {currentFlow.accountHint}
                  </div>
                )}
              </div>
            </section>

            <section className={`${sectionClassName} space-y-4`}>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-slate-100 p-2.5 text-slate-600">
                  <Tags className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{currentFlow.categorySectionTitle}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {currentFlow.categorySectionDescription}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {currentFlow.categoryLabel}
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className={fieldClassName}
                >
                  <option value="">None</option>
                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {currentFlow.labelsLabel}
                </label>
                <LabelMultiSelect
                  labels={labels}
                  selectedIds={form.label_ids}
                  onChange={(labelIds) => setForm({ ...form, label_ids: labelIds })}
                />
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>{currentFlow.notesLabel}</span>
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={`${fieldClassName} resize-none`}
                  placeholder={currentFlow.notesPlaceholder}
                />
              </div>
            </section>

            {formError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {composerSubmitLabel}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={mobileFilterPicker !== null}
        onClose={() => setMobileFilterPicker(null)}
        title={mobileFilterPicker === "account" ? "Choose account" : "Choose category"}
        size="sm"
        mobileSheet
      >
        <div className="space-y-2 pb-4">
          {mobileFilterPicker === "account" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFilterAccount("");
                  setPage(0);
                  setMobileFilterPicker(null);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                <span>All accounts</span>
                {filterAccount === "" && <Check className="h-4 w-4 text-slate-900" />}
              </button>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setFilterAccount(account.id);
                    setPage(0);
                    setMobileFilterPicker(null);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
                >
                  <span>{account.name}</span>
                  {filterAccount === account.id && <Check className="h-4 w-4 text-slate-900" />}
                </button>
              ))}
            </>
          )}

          {mobileFilterPicker === "category" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFilterCategory("");
                  setPage(0);
                  setMobileFilterPicker(null);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                <span>All categories</span>
                {filterCategory === "" && <Check className="h-4 w-4 text-slate-900" />}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setFilterCategory(category.id);
                    setPage(0);
                    setMobileFilterPicker(null);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-slate-50"
                >
                  <span>{category.name}</span>
                  {filterCategory === category.id && <Check className="h-4 w-4 text-slate-900" />}
                </button>
              ))}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
