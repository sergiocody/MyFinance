"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { LabelMultiSelect } from "@/components/LabelMultiSelect";
import Modal from "@/components/Modal";
import { SplitModal } from "@/components/SplitModal";
import { createTransactionHash, formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Filter,
  Landmark,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Split,
  Tags,
  Trash2,
  X,
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
    accent: "danger",
  },
  {
    value: "income",
    label: "Income",
    hint: "Money in",
    icon: ArrowDownLeft,
    accent: "success",
  },
  {
    value: "transfer",
    label: "Transfer",
    hint: "Move funds",
    icon: ArrowRightLeft,
    accent: "info",
  },
] as const;

const TYPE_ACCENT_CLASS: Record<(typeof TRANSACTION_TYPE_OPTIONS)[number]["accent"], string> = {
  danger:
    "border-[rgba(184,66,46,0.32)] bg-[rgba(184,66,46,0.08)] text-[var(--color-danger)]",
  success:
    "border-[rgba(63,107,78,0.32)] bg-[rgba(63,107,78,0.08)] text-[var(--color-success)]",
  info:
    "border-[rgba(58,79,102,0.32)] bg-[rgba(58,79,102,0.08)] text-[var(--color-info)]",
};

const TYPE_ICON_CLASS: Record<(typeof TRANSACTION_TYPE_OPTIONS)[number]["accent"], string> = {
  danger: "bg-[rgba(184,66,46,0.12)] text-[var(--color-danger)]",
  success: "bg-[rgba(63,107,78,0.12)] text-[var(--color-success)]",
  info: "bg-[rgba(58,79,102,0.12)] text-[var(--color-info)]",
};

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
    descriptionPlaceholder: "Groceries, coffee, utilities, rent…",
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
    submitLabel: "Save Expense",
  },
  income: {
    eyebrow: "Income Flow",
    title: "Register income",
    subtitle: "Log incoming money, select where it lands, and classify it if needed.",
    steps: ["Source", "Deposit into", "Classify"],
    descriptionLabel: "Where did it come from?",
    descriptionPlaceholder: "Salary, invoice, refund, interest…",
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
    submitLabel: "Save Income",
  },
  transfer: {
    eyebrow: "Transfer Flow",
    title: "Move money between accounts",
    subtitle: "Pick the source, pick the destination, and save. The rest is optional.",
    steps: ["Amount", "From and to", "Optional details"],
    descriptionLabel: "Transfer note",
    descriptionPlaceholder: "Savings top-up, card repayment, cash withdrawal…",
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
    submitLabel: "Save Transfer",
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
    date: format(new Date(), "yyyy-MM-dd"),
    label_ids: [] as string[],
    transfer_to_account_id: "",
  };
}

function amountClass(
  type: "income" | "expense" | "transfer",
  filterAccount: string,
  destinationId: string | null | undefined
) {
  if (type === "income") return "amount-pos";
  if (type === "expense") return "amount-neg";
  if (type === "transfer" && filterAccount && destinationId === filterAccount) return "amount-pos";
  return "amount-transfer";
}

function amountSign(
  type: "income" | "expense" | "transfer",
  filterAccount: string,
  destinationId: string | null | undefined
) {
  if (type === "income") return "+";
  if (type === "expense") return "-";
  if (type === "transfer" && filterAccount && destinationId === filterAccount) return "+";
  if (type === "transfer") return "-";
  return "";
}

export default function TransactionsPage() {
  type TransactionFilterType = "" | "income" | "expense" | "transfer";
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountParam = searchParams.get("account") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const typeParam = (searchParams.get("type") ?? "") as TransactionFilterType;
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
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
  const [splitTarget, setSplitTarget] = useState<TransactionWithRelations | null>(null);
  const [splitChildren, setSplitChildren] = useState<Record<string, TransactionWithRelations[]>>({});
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  const [filterAccount, setFilterAccount] = useState(accountParam);
  const [filterCategory, setFilterCategory] = useState(categoryParam);
  const [filterType, setFilterType] = useState<TransactionFilterType>(typeParam);
  const [filterDateFrom, setFilterDateFrom] = useState(fromParam);
  const [filterDateTo, setFilterDateTo] = useState(toParam);
  const [showFilters, setShowFilters] = useState(
    Boolean(accountParam || categoryParam || typeParam || fromParam || toParam)
  );
  const [showBalances, setShowBalances] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const next = searchInput.trim();
    if (next === searchTerm) return;
    const handle = setTimeout(() => {
      setSearchTerm(next);
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, searchTerm]);

  useEffect(() => {
    setFilterAccount(accountParam);
    setFilterCategory(categoryParam);
    setFilterType(typeParam);
    setFilterDateFrom(fromParam);
    setFilterDateTo(toParam);
    // Only auto-open: clearing the last filter from the panel must not collapse it.
    if (accountParam || categoryParam || typeParam || fromParam || toParam) setShowFilters(true);
    setPage(0);
  }, [accountParam, categoryParam, typeParam, fromParam, toParam]);
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    account_id: "",
    category_id: "",
    type: "expense" as "income" | "expense" | "transfer",
    amount: "",
    description: "",
    notes: "",
    date: format(new Date(), "yyyy-MM-dd"),
    label_ids: [] as string[],
    transfer_to_account_id: "",
  });

  const loadTransactions = useCallback(async () => {
    setLoadError("");

    const columns =
      "*, categories(*), accounts:accounts!transactions_account_id_fkey(*), destination_account:accounts!transactions_transfer_to_account_id_fkey(*), transaction_labels(labels(*))";
    let query = (
      searchTerm
        ? supabase
            .rpc("search_transactions", { p_query: searchTerm }, { count: "exact" })
            .select(columns)
        : supabase.from("transactions").select(columns, { count: "exact" })
    )
      .is("parent_transaction_id", null)
      .order("date", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterAccount)
      query = query.or(
        `account_id.eq.${filterAccount},transfer_to_account_id.eq.${filterAccount}`
      );
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
  }, [page, searchTerm, filterAccount, filterCategory, filterType, filterDateFrom, filterDateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTransactions();
  }, [loadTransactions]);

  const loadRefs = useCallback(async () => {
    const [{ data: accts }, { data: cats }, { data: lbls }] = await Promise.all([
      supabase.from("accounts").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("labels").select("*").order("name"),
    ]);
    if (accts) setAccounts(accts);
    if (cats) setCategories(cats);
    if (lbls) setLabels(lbls);
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

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

  function showFormError(message: string, fieldId: string) {
    setFormError(message);
    document.getElementById(fieldId)?.focus();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    const amount = parseFloat(form.amount);
    if (!amount) {
      showFormError("Enter an amount greater than zero.", "composer-amount");
      return;
    }

    if (!form.account_id) {
      showFormError("Select the account for this transaction.", "composer-account");
      return;
    }

    if (form.type === "transfer" && !form.transfer_to_account_id) {
      showFormError("Choose the destination account for this transfer.", "composer-destination");
      return;
    }

    if (form.type === "transfer" && form.transfer_to_account_id === form.account_id) {
      showFormError("Origin and destination accounts must be different.", "composer-destination");
      return;
    }

    setSaving(true);
    await persistTransaction(amount).finally(() => setSaving(false));
  }

  async function persistTransaction(amount: number) {
    const isSyncedEdit = editing && editing.source === "sync";

    if (isSyncedEdit) {
      const { error } = await supabase
        .from("transactions")
        .update({
          category_id: form.category_id || null,
          notes: form.notes || null,
          type: form.type,
          transfer_to_account_id:
            form.type === "transfer" ? form.transfer_to_account_id || null : null,
          ...(form.type === "transfer" ? { account_id: form.account_id } : {}),
        })
        .eq("id", editing.id);

      if (error) {
        setFormError(`The transaction could not be saved (${error.message}). Check the details and try again.`);
        return;
      }

      await supabase.from("transaction_labels").delete().eq("transaction_id", editing.id);
      if (form.label_ids.length > 0) {
        const { error: labelError } = await supabase.from("transaction_labels").insert(
          form.label_ids.map((lid) => ({
            transaction_id: editing.id,
            label_id: lid,
          }))
        );

        if (labelError) {
          setFormError(`The transaction was saved but its labels were not (${labelError.message}). Try saving again.`);
          return;
        }
      }

      setModalOpen(false);
      loadTransactions();
      void loadRefs();
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
      transfer_to_account_id: form.type === "transfer" ? form.transfer_to_account_id || null : null,
    };

    const transactionResponse = editing
      ? await supabase
          .from("transactions")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single()
      : await supabase.from("transactions").insert(payload).select().single();

    if (transactionResponse.error) {
      setFormError(
        transactionResponse.error.code === "23505"
          ? composerMode === "duplicate"
            ? "This copy matches an existing transaction exactly. Change at least one key detail before saving it as a new row."
            : "A matching transaction already exists for this account."
          : `The transaction could not be saved (${transactionResponse.error.message}). Check the details and try again.`
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
        setFormError(`The transaction was saved but its labels were not (${error.message}). Edit it to add the labels again.`);
        return;
      }
    }

    setModalOpen(false);
    loadTransactions();
    void loadRefs();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setActionError("");
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setActionError(`The transaction could not be deleted (${error.message}). Try again.`);
      return;
    }
    loadTransactions();
    void loadRefs();
  }

  async function updateTransactionCategory(id: string, categoryId: string | null) {
    setActionError("");
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId })
      .eq("id", id);
    if (error) {
      setActionError(`The category could not be changed (${error.message}). Try again.`);
    }
    loadTransactions();
  }

  function updateFilters(patch: {
    account?: string;
    category?: string;
    type?: TransactionFilterType;
    from?: string;
    to?: string;
  }) {
    if (patch.account !== undefined) setFilterAccount(patch.account);
    if (patch.category !== undefined) setFilterCategory(patch.category);
    if (patch.type !== undefined) setFilterType(patch.type);
    if (patch.from !== undefined) setFilterDateFrom(patch.from);
    if (patch.to !== undefined) setFilterDateTo(patch.to);
    setPage(0);

    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/transactions?${nextQuery}` : "/transactions", { scroll: false });
  }

  function openSplit(tx: TransactionWithRelations) {
    setSplitTarget(tx);
  }

  const loadChildren = useCallback(async (parentId: string) => {
    const { data } = await supabase
      .from("transactions")
      .select(
        "*, categories(*), accounts:accounts!transactions_account_id_fkey(*), destination_account:accounts!transactions_transfer_to_account_id_fkey(*), transaction_labels(labels(*))"
      )
      .eq("parent_transaction_id", parentId)
      .order("created_at", { ascending: true });
    if (data) {
      setSplitChildren((prev) => ({ ...prev, [parentId]: data as unknown as TransactionWithRelations[] }));
    }
  }, []);

  async function toggleExpand(tx: TransactionWithRelations) {
    const next = !expandedParents[tx.id];
    setExpandedParents((prev) => ({ ...prev, [tx.id]: next }));
    if (next && !splitChildren[tx.id]) {
      await loadChildren(tx.id);
    }
  }

  function refreshAfterSplit() {
    setSplitChildren({});
    setExpandedParents({});
    loadTransactions();
    void loadRefs();
  }

  const [categorizing, setCategorizing] = useState(false);

  async function handleAutoCategorize() {
    const uncategorized = transactions.filter((tx) => !tx.category_id && tx.description);
    if (uncategorized.length === 0) return;

    setCategorizing(true);
    setActionStatus("");

    const { data: categorized } = await supabase
      .from("transactions")
      .select("description, category_id")
      .not("category_id", "is", null)
      .not("description", "is", null);

    if (!categorized || categorized.length === 0) {
      setCategorizing(false);
      setActionStatus("No categorized history to learn from yet. Categorize a few transactions manually first.");
      return;
    }

    const descCatMap = new Map<string, Map<string, number>>();
    for (const row of categorized) {
      const key = (row.description ?? "").trim().toLowerCase();
      if (!key) continue;
      if (!descCatMap.has(key)) descCatMap.set(key, new Map());
      const catCounts = descCatMap.get(key)!;
      catCounts.set(row.category_id!, (catCounts.get(row.category_id!) ?? 0) + 1);
    }

    const bestCat = new Map<string, string>();
    for (const [desc, catCounts] of descCatMap) {
      let best = "";
      let bestCount = 0;
      for (const [catId, count] of catCounts) {
        if (count > bestCount) {
          best = catId;
          bestCount = count;
        }
      }
      if (best) bestCat.set(desc, best);
    }

    let updated = 0;
    for (const tx of uncategorized) {
      const key = (tx.description ?? "").trim().toLowerCase();
      const matchedCat = bestCat.get(key);
      if (matchedCat) {
        const { error } = await supabase
          .from("transactions")
          .update({ category_id: matchedCat })
          .eq("id", tx.id);
        if (!error) updated += 1;
      }
    }

    setCategorizing(false);
    setActionStatus(
      updated > 0
        ? `Categorized ${updated} of ${uncategorized.length} transactions on this page.`
        : "No matches found. Categorize similar transactions manually to teach Auto-Categorize."
    );
    loadTransactions();
  }

  function resetFilters() {
    updateFilters({ account: "", category: "", type: "", from: "", to: "" });
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const filteredCategories = categories.filter((category) => category.type === form.type);
  const selectedAccount = accounts.find((account) => account.id === form.account_id);
  const selectedDestinationAccount = accounts.find(
    (account) => account.id === form.transfer_to_account_id
  );
  const currentFlow = FLOW_CONTENT[form.type];
  const activeFilterCount = [
    filterAccount,
    filterCategory,
    filterType,
    filterDateFrom,
    filterDateTo,
  ].filter(Boolean).length;
  const activeFilterSummary = [
    filterAccount
      ? `Account: ${accounts.find((account) => account.id === filterAccount)?.name ?? "Selected"}`
      : null,
    filterCategory
      ? `Category: ${categories.find((category) => category.id === filterCategory)?.name ?? "Selected"}`
      : null,
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
      ? "Save Changes"
      : composerMode === "duplicate"
        ? "Create Copy"
        : currentFlow.submitLabel;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div>
            <p className="label-caps">Ledger</p>
            <h1 className="page-title mt-1">
              Transactions
            </h1>
            <p className="mt-1 text-sm text-[var(--color-secondary)]">
              Browse the ledger, then refine it with quick filters.
            </p>
          </div>

          {!showFilters && activeFilterSummary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterSummary.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-none sm:items-center">
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className="btn btn-secondary"
          >
            <Filter size={16} aria-hidden />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-2xs font-semibold text-[var(--color-neutral)]">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowBalances(!showBalances)}
            aria-expanded={showBalances}
            className="btn btn-secondary"
          >
            <Landmark size={16} aria-hidden />
            Balances
          </button>
          <button
            onClick={handleAutoCategorize}
            disabled={
              categorizing || transactions.filter((tx) => !tx.category_id).length === 0
            }
            className="btn btn-secondary"
          >
            <Tags size={16} className={categorizing ? "animate-pulse" : ""} aria-hidden />
            {categorizing ? "Categorizing…" : "Auto-Categorize"}
          </button>
          <button
            onClick={() => openCreate("expense")}
            className="btn btn-primary col-span-2 sm:col-span-1"
            hidden={Boolean(
              filterAccount &&
                accounts.find((a) => a.id === filterAccount)?.account_mode === "automated"
            )}
          >
            <Plus size={16} aria-hidden />
            New Expense
          </button>
        </div>
      </div>

      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-secondary)]"
        />
        <input
          type="text"
          name="transaction-search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by description…"
          aria-label="Search transactions by description"
          className="field pl-9 pr-12"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Clear search"
            className="btn btn-ghost btn-icon absolute right-0 top-1/2 -translate-y-1/2"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      {showFilters && (
        <Card className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="label-caps">Refine List</p>
              <h2 className="section-title mt-1">Filters</h2>
              <p className="mt-1 text-sm text-[var(--color-secondary)]">
                Results update instantly as you narrow down the list.
              </p>
            </div>

            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="btn btn-ghost self-start">
                <RotateCcw size={16} aria-hidden />
                Reset
              </button>
            )}
          </div>

          <div role="group" aria-labelledby="filter-type-label">
            <p id="filter-type-label" className="field-label">Type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FILTER_TYPE_OPTIONS.map((option) => {
                const isActive = filterType === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => updateFilters({ type: option.value as TransactionFilterType })}
                    aria-pressed={isActive}
                    className={`pressable tap-target rounded-md border px-3 text-sm font-medium ${
                      isActive
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-neutral)]"
                        : "border-[var(--color-border-strong)] bg-white text-[var(--color-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-primary)]"
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
              <label id="filter-account-label" htmlFor="filter-account" className="field-label">
                Account
              </label>
              <button
                type="button"
                onClick={() => setMobileFilterPicker("account")}
                aria-labelledby="filter-account-label filter-account-value"
                className="field flex w-full items-center justify-between gap-2 text-left sm:hidden"
              >
                <span id="filter-account-value" className="truncate">{selectedFilterAccountName}</span>
                <span className="label-caps flex-none" aria-hidden>Choose</span>
              </button>
              <select
                id="filter-account"
                value={filterAccount}
                onChange={(e) => updateFilters({ account: e.target.value })}
                className="field hidden sm:block"
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label id="filter-category-label" htmlFor="filter-category" className="field-label">
                Category
              </label>
              <button
                type="button"
                onClick={() => setMobileFilterPicker("category")}
                aria-labelledby="filter-category-label filter-category-value"
                className="field flex w-full items-center justify-between gap-2 text-left sm:hidden"
              >
                <span id="filter-category-value" className="truncate">{selectedFilterCategoryName}</span>
                <span className="label-caps flex-none" aria-hidden>Choose</span>
              </button>
              <select
                id="filter-category"
                value={filterCategory}
                onChange={(e) => updateFilters({ category: e.target.value })}
                className="field hidden sm:block"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="filter-from" className="field-label">
                From
              </label>
              <input
                id="filter-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => updateFilters({ from: e.target.value })}
                className="field"
              />
            </div>

            <div>
              <label htmlFor="filter-to" className="field-label">
                To
              </label>
              <input
                id="filter-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => updateFilters({ to: e.target.value })}
                className="field"
              />
            </div>
          </div>
        </Card>
      )}

      {showBalances && (
        <Card className="space-y-4">
          <div>
            <p className="label-caps">Overview</p>
            <h2 className="section-title mt-1">Account Balances</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {accounts.map((account) => {
              const childrenBalanceSum = accounts
                .filter((a) => a.parent_account_id === account.id)
                .reduce((sum, a) => sum + Number(a.current_balance), 0);
              const hasChildren = accounts.some((a) => a.parent_account_id === account.id);
              const displayBalance = hasChildren
                ? Number(account.current_balance) - childrenBalanceSum
                : Number(account.current_balance);
              return (
                <div
                  key={account.id}
                  className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <p className="truncate text-xs text-[var(--color-secondary)]" title={account.name}>
                    {account.name}
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold tabular-nums wrap-anywhere ${
                      displayBalance >= 0 ? "text-[var(--color-primary)]" : "amount-neg"
                    }`}
                  >
                    {formatCurrency(displayBalance, account.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {actionError && (
        <div role="alert" className="notice notice-danger">
          {actionError}
        </div>
      )}

      {actionStatus && <p className="notice">{actionStatus}</p>}

      <p role="status" className="sr-only">
        {actionStatus}
      </p>

      <p role="status" className="sr-only">
        {loading ? "" : `${totalCount} transaction${totalCount === 1 ? "" : "s"} found`}
      </p>

      <Card className="overflow-x-auto p-0!">
        {loadError && (
          <div
            role="alert"
            className="border-b border-[var(--color-border)] bg-[rgba(184,66,46,0.06)] px-4 py-3 text-sm text-[var(--color-danger)]"
          >
            Transactions could not be loaded ({loadError}). Reload the page or clear the filters and try again.
          </div>
        )}

        {/* Mobile: card list */}
        <div className="md:hidden">
          {loading ? (
            <div role="status" className="px-4 py-8 text-center text-sm text-[var(--color-secondary)]">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-secondary)]">
              No transactions found
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {transactions.map((tx) => (
                <div key={tx.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold text-[var(--color-primary)]"
                        title={tx.description || "Untitled transaction"}
                      >
                        {tx.description || "Untitled transaction"}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-xs text-[var(--color-secondary)]">{formatDate(tx.date)}</p>
                        {tx.is_split && (
                          <span className="chip chip-info">
                            <Split size={12} aria-hidden />
                            Split
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${amountClass(
                        tx.type,
                        filterAccount,
                        tx.transfer_to_account_id
                      )}`}
                    >
                      {amountSign(tx.type, filterAccount, tx.transfer_to_account_id)}
                      {formatCurrency(Number(tx.amount))}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[rgba(26,28,30,0.02)] p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="label-caps flex-none">Account</span>
                      <div className="flex min-w-0 items-center gap-2 text-[var(--color-secondary)]">
                        <div
                          className="h-2 w-2 flex-none rounded-full"
                          style={{ backgroundColor: tx.accounts?.color }}
                        />
                        <span className="truncate">{tx.accounts?.name ?? "-"}</span>
                      </div>
                    </div>

                    {tx.destination_account && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="label-caps flex-none">
                          Destination
                        </span>
                        <div className="flex min-w-0 items-center gap-2 text-[var(--color-secondary)]">
                          <div
                            className="h-2 w-2 flex-none rounded-full"
                            style={{ backgroundColor: tx.destination_account.color }}
                          />
                          <span className="truncate">{tx.destination_account.name}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="label-caps flex-none">Category</span>
                      <select
                        value={tx.category_id ?? ""}
                        aria-label={`Category for ${tx.description || "untitled transaction"}`}
                        onChange={(e) => void updateTransactionCategory(tx.id, e.target.value || null)}
                        className="pill-select min-w-0"
                        style={
                          tx.categories
                            ? {
                                backgroundColor: tx.categories.color + "20",
                                color: tx.categories.color,
                              }
                            : undefined
                        }
                      >
                        <option value="">—</option>
                        {categories
                          .filter((c) => c.type === tx.type || tx.type === "transfer")
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {tx.transaction_labels && tx.transaction_labels.length > 0 && (
                      <div className="space-y-2">
                        <span className="label-caps block">
                          Labels
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {tx.transaction_labels.map((tl) => (
                            <span
                              key={tl.labels.id}
                              className="chip"
                              style={{
                                backgroundColor: tl.labels.color + "20",
                                color: tl.labels.color,
                              }}
                            >
                              {tl.labels.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {tx.notes && (
                      <div className="space-y-1">
                        <span className="label-caps block">
                          Notes
                        </span>
                        <p className="text-xs text-[var(--color-secondary)] wrap-anywhere">{tx.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {tx.source !== "sync" && (
                      <button onClick={() => openDuplicate(tx)} className="btn btn-secondary">
                        Copy
                      </button>
                    )}
                    {tx.type !== "transfer" && (
                      <button onClick={() => openSplit(tx)} className="btn btn-secondary">
                        {tx.is_split ? "Edit split" : "Split"}
                      </button>
                    )}
                    <button onClick={() => openEdit(tx)} className="btn btn-secondary">
                      {tx.source === "sync" ? "Categorize" : "Edit"}
                    </button>
                    {tx.source !== "sync" && (
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="btn btn-danger-outline"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {tx.is_split && (
                    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[rgba(26,28,30,0.02)] px-3 pb-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(tx)}
                        aria-expanded={Boolean(expandedParents[tx.id])}
                        className="pressable tap-target flex w-full items-center justify-between text-xs font-medium text-[var(--color-primary)]"
                      >
                        <span>
                          {expandedParents[tx.id]
                            ? "Hide splits"
                            : `Show splits${splitChildren[tx.id] ? ` (${splitChildren[tx.id].length})` : ""}`}
                        </span>
                        <ChevronDown
                          size={16}
                          aria-hidden
                          className={`transition-transform duration-150 ${expandedParents[tx.id] ? "" : "-rotate-90"}`}
                        />
                      </button>
                      {expandedParents[tx.id] && (splitChildren[tx.id] ?? []).map((child) => (
                        <div
                          key={child.id}
                          className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="chip flex-none"
                              style={
                                child.categories
                                  ? {
                                      backgroundColor: child.categories.color + "20",
                                      color: child.categories.color,
                                    }
                                  : undefined
                              }
                            >
                              {child.categories?.name ?? "Uncategorized"}
                            </span>
                            {child.description && (
                              <span className="truncate text-[var(--color-secondary)]">
                                {child.description}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 font-medium tabular-nums text-[var(--color-primary)]">
                            {formatCurrency(Number(child.amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left">
              <th className="label-caps px-4 py-3">Date</th>
              <th className="label-caps px-4 py-3">Description</th>
              <th className="label-caps px-4 py-3">Account</th>
              <th className="label-caps px-4 py-3">Destination</th>
              <th className="label-caps px-4 py-3">Category</th>
              <th className="label-caps px-4 py-3">Labels</th>
              <th className="label-caps px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-secondary)]">
                  <span role="status">Loading…</span>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--color-secondary)]">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.flatMap((tx) => {
                const isExpanded = Boolean(expandedParents[tx.id]);
                const children = splitChildren[tx.id] ?? [];
                const rows: React.ReactNode[] = [];
                rows.push(
                <tr key={tx.id} className="transition-colors duration-150 hover:bg-[rgba(26,28,30,0.03)]">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--color-secondary)]">
                    {formatDate(tx.date)}
                  </td>
                  <td className="max-w-80 px-4 py-3">
                    <div className="flex items-start gap-2">
                      {tx.is_split && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(tx)}
                          aria-label={isExpanded ? "Collapse splits" : "Expand splits"}
                          aria-expanded={isExpanded}
                          className="btn btn-ghost btn-icon -my-2 -ml-2"
                        >
                          <ChevronDown
                            size={16}
                            aria-hidden
                            className={`transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`}
                          />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p
                          className="truncate font-medium text-[var(--color-primary)]"
                          title={tx.description || "—"}
                        >
                          {tx.description || "—"}
                        </p>
                        {tx.is_split && (
                          <span className="chip chip-info mt-1">
                            <Split size={12} aria-hidden />
                            Split
                          </span>
                        )}
                        {tx.notes && (
                          <p className="truncate text-xs text-[var(--color-secondary)]" title={tx.notes}>
                            {tx.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ backgroundColor: tx.accounts?.color }}
                      />
                      <span className="block max-w-48 truncate text-[var(--color-secondary)]" title={tx.accounts?.name}>
                        {tx.accounts?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {tx.destination_account ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 flex-none rounded-full"
                          style={{ backgroundColor: tx.destination_account.color }}
                        />
                        <span className="text-[var(--color-secondary)]">
                          {tx.destination_account.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--color-secondary)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={tx.category_id ?? ""}
                      aria-label={`Category for ${tx.description || "untitled transaction"}`}
                      onChange={(e) => void updateTransactionCategory(tx.id, e.target.value || null)}
                      className="pill-select"
                      style={
                        tx.categories
                          ? {
                              backgroundColor: tx.categories.color + "20",
                              color: tx.categories.color,
                            }
                          : undefined
                      }
                    >
                      <option value="">—</option>
                      {categories
                        .filter((c) => c.type === tx.type || tx.type === "transfer")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {tx.transaction_labels?.map((tl) => (
                        <span
                          key={tl.labels.id}
                          className="chip"
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
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                    <span
                      className={amountClass(tx.type, filterAccount, tx.transfer_to_account_id)}
                    >
                      {amountSign(tx.type, filterAccount, tx.transfer_to_account_id)}
                      {formatCurrency(Number(tx.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {tx.source !== "sync" && (
                        <button
                          onClick={() => openDuplicate(tx)}
                          aria-label="Copy transaction"
                          title="Copy transaction"
                          className="btn btn-ghost btn-icon"
                        >
                          <Copy size={16} aria-hidden />
                        </button>
                      )}
                      {tx.type !== "transfer" && (
                        <button
                          onClick={() => openSplit(tx)}
                          aria-label={tx.is_split ? "Edit split" : "Split transaction"}
                          title={tx.is_split ? "Edit split" : "Split transaction"}
                          className="btn btn-ghost btn-icon"
                        >
                          <Split size={16} aria-hidden />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(tx)}
                        aria-label={tx.source === "sync" ? "Categorize transaction" : "Edit transaction"}
                        title={tx.source === "sync" ? "Categorize" : "Edit"}
                        className="btn btn-ghost btn-icon"
                      >
                        <Pencil size={16} aria-hidden />
                      </button>
                      {tx.source !== "sync" && (
                        <button
                          onClick={() => handleDelete(tx.id)}
                          aria-label="Delete transaction"
                          title="Delete transaction"
                          className="btn btn-ghost btn-icon hover:text-[var(--color-danger)]"
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
                if (tx.is_split && isExpanded) {
                  children.forEach((child) => {
                    rows.push(
                      <tr key={child.id} className="bg-[rgba(26,28,30,0.02)]">
                        <td className="px-4 py-2 text-xs text-[var(--color-secondary)]" />
                        <td className="px-4 py-2 pl-12 text-sm text-[var(--color-primary)]" colSpan={4}>
                          <div className="flex items-center gap-2">
                            <span
                              className="chip"
                              style={
                                child.categories
                                  ? {
                                      backgroundColor: child.categories.color + "20",
                                      color: child.categories.color,
                                    }
                                  : undefined
                              }
                            >
                              {child.categories?.name ?? "Uncategorized"}
                            </span>
                            {child.description && (
                              <span className="truncate text-xs text-[var(--color-secondary)]">
                                {child.description}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {child.transaction_labels?.map((tl) => (
                              <span
                                key={tl.labels.id}
                                className="chip"
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
                        <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-medium tabular-nums text-[var(--color-secondary)]">
                          {formatCurrency(Number(child.amount))}
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    );
                  });
                }
                return rows;
              })
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3">
            <p className="text-xs tabular-nums text-[var(--color-secondary)]">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{" "}
              {totalCount}
            </p>
            <div className="flex flex-none gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
                className="btn btn-secondary btn-icon"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
                className="btn btn-secondary btn-icon"
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Composer modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={composerTitle}
        size="lg"
        mobileSheet
        bodyClassName="p-0"
      >
        <form onSubmit={handleSave} className="flex h-full flex-col bg-[var(--color-neutral)]">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 sm:pb-6">
            <section className="surface-card overflow-hidden rounded-md p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="label-caps">
                    {currentFlow.eyebrow}
                  </p>
                  <h3 className="section-title mt-1">
                    {composerHeading}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-secondary)]">{composerSubtitle}</p>
                </div>
                <div className="chip flex-none whitespace-nowrap">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {formatDate(form.date)}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {TRANSACTION_TYPE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isActive = form.type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const isSyncedIncomeToTransfer =
                          editing?.source === "sync" &&
                          editing.type === "income" &&
                          option.value === "transfer";

                        setForm({
                          ...form,
                          type: option.value,
                          category_id: "",
                          account_id: isSyncedIncomeToTransfer ? "" : form.account_id,
                          transfer_to_account_id:
                            option.value === "transfer"
                              ? isSyncedIncomeToTransfer
                                ? editing.account_id
                                : form.transfer_to_account_id
                              : "",
                        });
                      }}
                      aria-pressed={isActive}
                      className={`pressable min-w-0 rounded-md border p-2 text-left sm:p-3 ${
                        isActive
                          ? TYPE_ACCENT_CLASS[option.accent]
                          : "border-[var(--color-border-strong)] bg-white text-[var(--color-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-primary)]"
                      }`}
                    >
                      <span
                        className={`mb-3 inline-flex rounded-full p-2 ${
                          isActive ? TYPE_ICON_CLASS[option.accent] : "bg-[rgba(26,28,30,0.06)] text-[var(--color-secondary)]"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="block truncate text-sm font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs text-current/80">{option.hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {currentFlow.steps.map((step, index) => (
                  <span
                    key={`${currentFlow.eyebrow}-${step}`}
                    className="label-caps inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white py-1 pl-1 pr-3"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-2xs text-[var(--color-neutral)]">
                      {index + 1}
                    </span>
                    {step}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label htmlFor="composer-description" className="field-label">
                    {currentFlow.descriptionLabel}
                  </label>
                  <input
                    id="composer-description"
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="field text-base"
                    placeholder={currentFlow.descriptionPlaceholder}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-5">
                  <div className="sm:col-span-3">
                    <label htmlFor="composer-amount" className="field-label">
                      {currentFlow.amountLabel}
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-[var(--color-secondary)]" aria-hidden>
                        €
                      </span>
                      <input
                        id="composer-amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        required
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        className="field pl-9 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="composer-date" className="field-label">
                      Date
                    </label>
                    <input
                      id="composer-date"
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="field"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="surface-card rounded-md p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex-none rounded-md bg-[rgba(26,28,30,0.06)] p-2 text-[var(--color-secondary)]">
                  <Landmark className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[var(--color-primary)]">
                    {currentFlow.accountSectionTitle}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-secondary)]">
                    {currentFlow.accountSectionDescription}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="composer-account" className="field-label">
                    {currentFlow.accountLabel}
                  </label>
                  <select
                    id="composer-account"
                    required
                    value={form.account_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        account_id: e.target.value,
                        transfer_to_account_id:
                          e.target.value === form.transfer_to_account_id
                            ? ""
                            : form.transfer_to_account_id,
                      })
                    }
                    className="field"
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  {selectedAccount && (
                    <p className="mt-2 text-xs text-[var(--color-secondary)]">
                      {currentFlow.accountHint} Current selection: {selectedAccount.name}
                    </p>
                  )}
                </div>

                {form.type === "transfer" ? (
                  <div>
                    <label htmlFor="composer-destination" className="field-label">
                      {currentFlow.destinationLabel}
                    </label>
                    <select
                      id="composer-destination"
                      value={form.transfer_to_account_id}
                      onChange={(e) =>
                        setForm({ ...form, transfer_to_account_id: e.target.value })
                      }
                      className="field"
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
                      <p className="mt-2 text-xs text-[var(--color-secondary)]">
                        Funds move to {selectedDestinationAccount.name}
                      </p>
                    )}
                    {selectedDestinationAccount?.account_mode === "automated" && (
                      <p className="notice notice-warning mt-2 text-xs">
                        <span aria-hidden>⚠️</span> This account is synced with a bank. The transfer may also be imported
                        automatically during sync, which could cause a duplicate.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[rgba(26,28,30,0.02)] px-4 py-3 text-sm text-[var(--color-secondary)]">
                    {currentFlow.accountHint}
                  </div>
                )}
              </div>
            </section>

            <section className="surface-card space-y-4 rounded-md p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex-none rounded-md bg-[rgba(26,28,30,0.06)] p-2 text-[var(--color-secondary)]">
                  <Tags className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[var(--color-primary)]">
                    {currentFlow.categorySectionTitle}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-secondary)]">
                    {currentFlow.categorySectionDescription}
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="composer-category" className="field-label">
                  {currentFlow.categoryLabel}
                </label>
                <select
                  id="composer-category"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="field"
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
                <p id="composer-labels-label" className="field-label">
                  {currentFlow.labelsLabel}
                </p>
                <LabelMultiSelect
                  labelledBy="composer-labels-label"
                  labels={labels}
                  selectedIds={form.label_ids}
                  onChange={(labelIds) => setForm({ ...form, label_ids: labelIds })}
                />
              </div>

              <div>
                <label htmlFor="composer-notes" className="field-label">
                  {currentFlow.notesLabel}
                </label>
                <textarea
                  id="composer-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="field resize-none"
                  placeholder={currentFlow.notesPlaceholder}
                />
              </div>
            </section>

            {formError && (
              <div role="alert" className="notice notice-danger">
                {formError}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-border)] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? "Saving…" : composerSubmitLabel}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <SplitModal
        key={splitTarget?.id ?? "none"}
        open={splitTarget !== null}
        onClose={() => setSplitTarget(null)}
        transaction={splitTarget}
        categories={categories}
        labels={labels}
        onSaved={refreshAfterSplit}
      />

      <Modal
        open={mobileFilterPicker !== null}
        onClose={() => setMobileFilterPicker(null)}
        title={mobileFilterPicker === "account" ? "Choose Account" : "Choose Category"}
        size="sm"
        mobileSheet
      >
        <div className="space-y-2 pb-4">
          {mobileFilterPicker === "account" && (
            <>
              <button
                type="button"
                onClick={() => {
                  updateFilters({ account: "" });
                  setMobileFilterPicker(null);
                }}
                aria-pressed={filterAccount === ""}
                className="pressable tap-target flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-left text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-hover)]"
              >
                <span className="truncate">All accounts</span>
                {filterAccount === "" && <Check className="h-4 w-4 flex-none text-[var(--color-tertiary)]" aria-hidden />}
              </button>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    updateFilters({ account: account.id });
                    setMobileFilterPicker(null);
                  }}
                  aria-pressed={filterAccount === account.id}
                  className="pressable tap-target flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-left text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-hover)]"
                >
                  <span className="truncate">{account.name}</span>
                  {filterAccount === account.id && (
                    <Check className="h-4 w-4 flex-none text-[var(--color-tertiary)]" aria-hidden />
                  )}
                </button>
              ))}
            </>
          )}

          {mobileFilterPicker === "category" && (
            <>
              <button
                type="button"
                onClick={() => {
                  updateFilters({ category: "" });
                  setMobileFilterPicker(null);
                }}
                aria-pressed={filterCategory === ""}
                className="pressable tap-target flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-left text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-hover)]"
              >
                <span className="truncate">All categories</span>
                {filterCategory === "" && <Check className="h-4 w-4 flex-none text-[var(--color-tertiary)]" aria-hidden />}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    updateFilters({ category: category.id });
                    setMobileFilterPicker(null);
                  }}
                  aria-pressed={filterCategory === category.id}
                  className="pressable tap-target flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-left text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-hover)]"
                >
                  <span className="truncate">{category.name}</span>
                  {filterCategory === category.id && (
                    <Check className="h-4 w-4 flex-none text-[var(--color-tertiary)]" aria-hidden />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
