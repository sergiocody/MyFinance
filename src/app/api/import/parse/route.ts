import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, GoogleGenerativeAIError, SchemaType, type Schema } from "@google/generative-ai";
import Papa from "papaparse";

type ParserProvider = "gemini" | "ollama-gemma" | "ollama-qwen";
type RequestedParserProvider = ParserProvider | "ollama";

type CategoryOption = {
  name: string;
  type: string;
  id: string;
};

type LabelOption = {
  id: string;
  name: string;
};

type AccountOption = {
  id: string;
  name: string;
  bank_name?: string | null;
  type: string;
};

type TransferRole = "source" | "destination";

type ParsedAiTransaction = {
  source_row?: unknown;
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  type?: unknown;
  category_id?: unknown;
  label_ids?: unknown;
  transfer_account_id?: unknown;
  selected_account_role?: unknown;
  notes?: unknown;
};

type StructuredCsvRow = {
  row_number: number;
  columns: Record<string, string>;
  raw_values: string[];
};

type ParsedTransaction = {
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

type ParseRequestBody = {
  csvContent?: string;
  categories?: CategoryOption[];
  labels?: LabelOption[];
  accounts?: AccountOption[];
  accountId?: string;
  selectedAccountName?: string;
  provider?: RequestedParserProvider;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_GEMMA_MODEL = process.env.OLLAMA_GEMMA_MODEL ?? process.env.OLLAMA_MODEL ?? "gemma3:4b";
const OLLAMA_QWEN_MODEL = process.env.OLLAMA_QWEN_MODEL ?? "qwen3:8b";

const transactionSchema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      source_row: { type: SchemaType.INTEGER },
      date: { type: SchemaType.STRING },
      description: { type: SchemaType.STRING },
      amount: { type: SchemaType.NUMBER },
      type: { type: SchemaType.STRING },
      category_id: { type: SchemaType.STRING, nullable: true },
      label_ids: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
      transfer_account_id: { type: SchemaType.STRING, nullable: true },
      selected_account_role: { type: SchemaType.STRING, nullable: true },
      notes: { type: SchemaType.STRING },
    },
    required: ["date", "description", "amount", "type", "notes"],
  },
};

const ollamaTransactionFormat = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_row: { type: "integer" },
          date: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          type: { type: "string" },
          category_id: { type: "string" },
          label_ids: {
            type: "array",
            items: { type: "string" },
          },
          transfer_account_id: { type: "string" },
          selected_account_role: { type: "string" },
          notes: { type: "string" },
        },
        required: ["date", "description", "amount", "type", "notes"],
      },
    },
  },
  required: ["transactions"],
};

function isOllamaProvider(provider: ParserProvider): provider is Exclude<ParserProvider, "gemini"> {
  return provider !== "gemini";
}

function normalizeProvider(provider: RequestedParserProvider | undefined): ParserProvider {
  if (provider === "ollama-qwen") {
    return "ollama-qwen";
  }

  if (provider === "ollama" || provider === "ollama-gemma") {
    return "ollama-gemma";
  }

  return "gemini";
}

function getProviderLabel(provider: ParserProvider) {
  if (provider === "ollama-gemma") {
    return "Ollama Gemma";
  }

  if (provider === "ollama-qwen") {
    return "Ollama Qwen";
  }

  return "Gemini";
}

function getOllamaModel(provider: Exclude<ParserProvider, "gemini">) {
  return provider === "ollama-qwen" ? OLLAMA_QWEN_MODEL : OLLAMA_GEMMA_MODEL;
}

function extractJsonPayload(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("AI returned an empty response");
  }

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeTransactionsPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as {
      transactions?: unknown;
      items?: unknown;
      data?: unknown;
    };

    if (Array.isArray(objectPayload.transactions)) {
      return objectPayload.transactions;
    }

    if (Array.isArray(objectPayload.items)) {
      return objectPayload.items;
    }

    if (Array.isArray(objectPayload.data)) {
      return objectPayload.data;
    }
  }

  return null;
}

function sanitizeCategoryId(
  categoryId: unknown,
  type: "income" | "expense" | "transfer",
  categories: CategoryOption[]
) {
  if (typeof categoryId !== "string" || categoryId.length === 0) {
    return null;
  }

  const category = categories.find((item) => item.id === categoryId);

  if (!category || category.type !== type) {
    return null;
  }

  return category.id;
}

function sanitizeLabelIds(labelIds: unknown, labels: LabelOption[]) {
  if (!Array.isArray(labelIds)) {
    return [];
  }

  const validIds = new Set(labels.map((label) => label.id));

  return [...new Set(labelIds)]
    .filter((labelId): labelId is string => typeof labelId === "string")
    .filter((labelId) => validIds.has(labelId));
}

function sanitizeTransferAccountId(
  transferAccountId: unknown,
  accounts: AccountOption[]
) {
  if (typeof transferAccountId !== "string" || transferAccountId.length === 0) {
    return null;
  }

  return accounts.find((account) => account.id === transferAccountId)?.id ?? null;
}

function sanitizeTransferRole(value: unknown, rawAmount: number): TransferRole {
  if (value === "source" || value === "destination") {
    return value;
  }

  return rawAmount >= 0 ? "destination" : "source";
}

function sanitizeTransactions(
  transactions: ParsedAiTransaction[],
  categories: CategoryOption[],
  labels: LabelOption[],
  accounts: AccountOption[]
) {
  return transactions
    .filter((transaction) => {
      const amount = Number(transaction.amount);
      return transaction.date && Number.isFinite(amount) && amount !== 0;
    })
    .map((transaction) => {
      const rawAmount = Number(transaction.amount);
      const inferredType: "income" | "expense" | "transfer" =
        transaction.type === "transfer" ? "transfer"
        : transaction.type === "income" ? "income"
        : transaction.type === "expense" ? "expense"
        : rawAmount > 0 ? "income" : "expense";

      const transferRole =
        inferredType === "transfer"
          ? sanitizeTransferRole(transaction.selected_account_role, rawAmount)
          : null;

      return {
        date: String(transaction.date),
        description: String(transaction.description ?? ""),
        amount: Math.abs(rawAmount),
        type: inferredType,
        category_id: sanitizeCategoryId(transaction.category_id, inferredType, categories),
        label_ids: sanitizeLabelIds(transaction.label_ids, labels),
        transfer_account_id:
          inferredType === "transfer"
            ? sanitizeTransferAccountId(transaction.transfer_account_id, accounts)
            : null,
        selected_account_role: transferRole,
        notes: String(transaction.notes ?? ""),
      };
    });
}

function enrichTransactions(
  transactions: ParsedTransaction[],
  categories: CategoryOption[],
  labels: LabelOption[],
  accounts: AccountOption[]
) {
  return transactions.map((transaction) => ({
    ...transaction,
    category_id:
      transaction.category_id ??
      matchCategoryId(transaction.description, transaction.type, categories),
    label_ids:
      transaction.label_ids.length > 0
        ? transaction.label_ids
        : matchLabelIds(transaction.description, labels),
    transfer_account_id:
      transaction.type === "transfer"
        ? transaction.transfer_account_id ??
          matchTransferAccountId(transaction.description, transaction.notes, accounts)
        : null,
  }));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseLocaleNumber(value: string) {
  const trimmed = value.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
  if (!trimmed) {
    return null;
  }

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;

  if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = trimmed.replace(/,/g, "");
  } else {
    normalized = trimmed.replace(",", ".");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const euro = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (euro) {
    const [, day, month, yearRaw] = euro;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function scoreHeader(header: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(header)) ? 10 : 0;
}

function detectColumnIndexes(header: string[], dataRows: StructuredCsvRow[]) {
  const normalizedHeaders = header.map(normalizeText);
  const samples = dataRows.slice(0, 10);

  const datePatterns = [/^date$/, /fecha/, /booking/, /value date/, /operacion/, /movimiento/];
  const descriptionPatterns = [/description/, /descripcion/, /concept/, /concepto/, /detalle/, /details?/, /merchant/, /payee/, /beneficiary/, /reference/];
  const amountPatterns = [/^amount$/, /importe/, /import$/, /total/, /valor/, /^eur$/, /money/];
  const debitPatterns = [/debit/, /cargo/, /withdrawal/, /outgoing/, /salida/];
  const creditPatterns = [/credit/, /abono/, /deposit/, /incoming/, /entrada/];
  const balancePatterns = [/balance/, /saldo/, /available/, /disponible/];

  const scoreByIndex = header.map((_, index) => {
    const values = samples.map((row) => row.raw_values[index] ?? "");
    const dateScore = values.filter((value) => parseDateValue(value)).length;
    const numericScore = values.filter((value) => parseLocaleNumber(value) !== null).length;
    const textScore = values.filter((value) => value && parseLocaleNumber(value) === null && !parseDateValue(value)).length;

    return {
      index,
      date: scoreHeader(normalizedHeaders[index], datePatterns) + dateScore,
      description: scoreHeader(normalizedHeaders[index], descriptionPatterns) + textScore,
      amount:
        scoreHeader(normalizedHeaders[index], amountPatterns) +
        numericScore -
        scoreHeader(normalizedHeaders[index], balancePatterns),
      debit: scoreHeader(normalizedHeaders[index], debitPatterns) + numericScore,
      credit: scoreHeader(normalizedHeaders[index], creditPatterns) + numericScore,
    };
  });

  const pickBest = (field: "date" | "description" | "amount" | "debit" | "credit") =>
    [...scoreByIndex].sort((left, right) => right[field] - left[field])[0]?.index ?? -1;

  const amountIndex = pickBest("amount");
  const debitIndex = pickBest("debit");
  const creditIndex = pickBest("credit");

  return {
    dateIndex: pickBest("date"),
    descriptionIndex: pickBest("description"),
    amountIndex: scoreByIndex[amountIndex]?.amount > 0 ? amountIndex : -1,
    debitIndex: scoreByIndex[debitIndex]?.debit > 0 ? debitIndex : -1,
    creditIndex: scoreByIndex[creditIndex]?.credit > 0 ? creditIndex : -1,
  };
}

function matchCategoryId(
  description: string,
  type: "income" | "expense" | "transfer",
  categories: CategoryOption[]
) {
  const normalizedDescription = normalizeText(description);
  const filteredCategories = categories.filter((category) => category.type === type);

  const directMatch = filteredCategories.find((category) =>
    normalizedDescription.includes(normalizeText(category.name))
  );
  if (directMatch) {
    return directMatch.id;
  }

  const keywordMap: Array<{ keywords: string[]; categoryNames: string[] }> = [
    { keywords: ["mercadona", "lidl", "alcampo", "hipercor", "supermerc"], categoryNames: ["Alimentación", "Groceries"] },
    { keywords: ["salary", "salario", "nomina"], categoryNames: ["Salario", "Salary"] },
    { keywords: ["uber", "taxi", "metro", "bus", "gasolina", "parking"], categoryNames: ["Transporte", "Transport"] },
    { keywords: ["cafe", "restaurant", "restaurante", "glovo", "comida", "cena"], categoryNames: ["Restaurantes", "Restaurants"] },
    { keywords: ["mcdonald", "burger king", "tagliatella", "telepizza", "domino"], categoryNames: ["Restaurantes", "Restaurants"] },
    { keywords: ["cine", "cinema", "palafox", "netflix", "spotify", "hbo"], categoryNames: ["Entretenimiento", "Entertainment", "Subscriptions"] },
    { keywords: ["amazon", "zara", "adidas", "nike", "shopping"], categoryNames: ["Compras", "Shopping"] },
    { keywords: ["google pay", "bizum", "paypal", "transfer", "transferencia", "traspaso"], categoryNames: ["Transfer"] },
    { keywords: ["interes"], categoryNames: ["Intereses_cuenta", "Interest"] },
  ];

  for (const rule of keywordMap) {
    if (!rule.keywords.some((keyword) => normalizedDescription.includes(keyword))) {
      continue;
    }

    const category = filteredCategories.find((item) =>
      rule.categoryNames.some((name) => normalizeText(item.name) === normalizeText(name))
    );

    if (category) {
      return category.id;
    }
  }

  return null;
}

function matchLabelIds(description: string, labels: LabelOption[]) {
  const normalizedDescription = normalizeText(description);

  const directMatches = labels
    .filter((label) => normalizedDescription.includes(normalizeText(label.name)))
    .map((label) => label.id);

  if (directMatches.length > 0) {
    return directMatches;
  }

  const labelKeywordMap: Array<{ keywords: string[]; labelNames: string[] }> = [
    { keywords: ["netflix", "spotify", "icloud", "subscription", "suscripcion"], labelNames: ["Recurring"] },
    { keywords: ["mercadona", "lidl", "farmacia", "electric", "agua", "rent"], labelNames: ["Essential"] },
    { keywords: ["adidas", "amazon", "cine", "restaurant", "tagliatella"], labelNames: ["Discretionary"] },
    { keywords: ["one-off", "one time", "unico"], labelNames: ["One-time"] },
  ];

  return labels
    .filter((label) =>
      labelKeywordMap.some(
        (rule) =>
          rule.labelNames.some((name) => normalizeText(name) === normalizeText(label.name)) &&
          rule.keywords.some((keyword) => normalizedDescription.includes(keyword))
      )
    )
    .map((label) => label.id);
}

function matchTransferAccountId(
  description: string,
  notes: string,
  accounts: AccountOption[]
) {
  const haystack = normalizeText(`${description} ${notes}`);
  const keywords = ["transfer", "traspaso", "transferencia", "from ", "to "];

  const matchedAccount = accounts.find((account) => {
    const accountTerms = [account.name, account.bank_name ?? "", account.type]
      .map(normalizeText)
      .filter(Boolean);

    return accountTerms.some((term) => haystack.includes(term));
  });

  if (matchedAccount) {
    return matchedAccount.id;
  }

  return keywords.some((keyword) => haystack.includes(keyword)) ? null : null;
}

function parseTransactionsDeterministically(
  header: string[],
  dataRows: StructuredCsvRow[],
  categories: CategoryOption[],
  labels: LabelOption[],
  accounts: AccountOption[]
): ParsedTransaction[] {
  const { dateIndex, descriptionIndex, amountIndex, debitIndex, creditIndex } =
    detectColumnIndexes(header, dataRows);

  console.log("[fallback] column indexes:", { dateIndex, descriptionIndex, amountIndex, debitIndex, creditIndex });
  console.log("[fallback] header:", header);

  return dataRows.flatMap((row) => {
    // Strategy 1: use detected date column; Strategy 2: scan all columns for a parseable date
    let parsedDate: string | null = null;
    let dateValue = "";
    if (dateIndex >= 0) {
      dateValue = row.raw_values[dateIndex] ?? "";
      parsedDate = parseDateValue(dateValue);
    }
    if (!parsedDate) {
      for (const value of row.raw_values) {
        const d = parseDateValue(value);
        if (d) { parsedDate = d; dateValue = value; break; }
      }
    }
    if (!parsedDate) {
      return [];
    }

    let rawAmount: number | null = null;
    let type: "income" | "expense" = "expense";

    // Strategy 1: use detected amount column
    if (amountIndex >= 0) {
      rawAmount = parseLocaleNumber(row.raw_values[amountIndex] ?? "");
      if (rawAmount !== null && rawAmount !== 0) {
        type = rawAmount > 0 ? "income" : "expense";
      } else {
        rawAmount = null;
      }
    }

    // Strategy 2: use debit/credit columns
    if (rawAmount === null) {
      const debitAmount = debitIndex >= 0 ? parseLocaleNumber(row.raw_values[debitIndex] ?? "") : null;
      const creditAmount = creditIndex >= 0 ? parseLocaleNumber(row.raw_values[creditIndex] ?? "") : null;

      if (creditAmount && creditAmount !== 0) {
        rawAmount = creditAmount;
        type = "income";
      } else if (debitAmount && debitAmount !== 0) {
        rawAmount = -Math.abs(debitAmount);
        type = "expense";
      }
    }

    // Strategy 3: scan any numeric column (skip the date column)
    if (rawAmount === null) {
      for (let i = 0; i < row.raw_values.length; i++) {
        if (i === dateIndex || i === descriptionIndex) continue;
        const val = parseLocaleNumber(row.raw_values[i] ?? "");
        if (val !== null && val !== 0) {
          rawAmount = val;
          type = val > 0 ? "income" : "expense";
          break;
        }
      }
    }

    if (rawAmount === null || rawAmount === 0) {
      return [];
    }

    const amount = Math.abs(rawAmount);
    const description =
      (descriptionIndex >= 0 ? row.raw_values[descriptionIndex] : "") ||
      row.raw_values.find((value, index) => index !== dateIndex && index !== amountIndex && index !== debitIndex && index !== creditIndex && value.trim().length > 0) ||
      `Row ${row.row_number}`;

    const notes = Object.entries(row.columns)
      .filter(([, value]) => value && value.trim().length > 0)
      .filter(([, value]) => value !== dateValue && value !== description)
      .filter(([, value]) => parseLocaleNumber(value) === null || value === row.raw_values[debitIndex] || value === row.raw_values[creditIndex])
      .map(([key, value]) => `${key}: ${value}`)
      .join(" | ");

    const transferAccountId = matchTransferAccountId(description, notes, accounts);
    const isTransfer = transferAccountId !== null;
    const transactionType: "income" | "expense" | "transfer" = isTransfer ? "transfer" : type;
    const transferRole =
      isTransfer
        ? rawAmount > 0
          ? "destination"
          : "source"
        : null;

    return [{
      date: parsedDate,
      description,
      amount,
      type: transactionType,
      category_id: matchCategoryId(description, transactionType, categories),
      label_ids: matchLabelIds(description, labels),
      transfer_account_id: transferAccountId,
      selected_account_role: transferRole,
      notes,
    }];
  });
}

function parseCsvRows(csvContent: string) {
  const parsed = Papa.parse<string[]>(csvContent.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  const rows = parsed.data
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length < 2) {
    throw new Error("CSV file does not contain enough rows to parse");
  }

  const header = rows[0].map((value, index) => value || `column_${index + 1}`);
  const dataRows: StructuredCsvRow[] = rows.slice(1).map((row, index) => {
    const width = Math.max(header.length, row.length);
    const values = Array.from({ length: width }, (_, valueIndex) => row[valueIndex] ?? "");
    const columns = Object.fromEntries(
      values.map((value, valueIndex) => [header[valueIndex] ?? `column_${valueIndex + 1}`, value])
    );

    return {
      row_number: index + 2,
      columns,
      raw_values: values,
    };
  });

  return {
    header,
    dataRows,
  };
}

function buildPrompt(
  categoryList: string,
  labelList: string,
  accountList: string,
  selectedAccountName: string,
  header: string[],
  dataRows: StructuredCsvRow[]
) {
  return `You are a financial data parser. Analyze this bank CSV export and extract transactions.

Selected import account:
${selectedAccountName}

Available categories:
${categoryList}

Available labels:
${labelList}

Other available accounts for transfers:
${accountList}

CSV header columns:
${header.join(" | ")}

Candidate CSV rows (${dataRows.length} rows, first 200 max):
${JSON.stringify(dataRows.slice(0, 200), null, 2)}

Parse each source row into a transaction. For each transaction, determine:
0. "source_row" - the original CSV row number from the input above
1. "date" - in YYYY-MM-DD format. Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY
2. "description" - the payee or memo from the bank
3. "amount" - always positive number. Handle comma as decimal separator (European format) and dot as thousands separator if needed
4. "type" - "income", "expense", or "transfer"
5. "category_id" - match the description to the best category from the list above. Use null if unsure
6. "label_ids" - array of label ids that fit the transaction. Use [] if none
7. "transfer_account_id" - if type is "transfer", choose the other account id from the list above. Use null if unsure
8. "selected_account_role" - if type is "transfer", return "source" when the selected import account is sending money, or "destination" when the selected import account is receiving money
9. "notes" - any additional info from the CSV row

Important rules:
- Return one JSON object per source row that represents a real transaction
- Do not merge multiple source rows into one output object
- Skip only rows that are empty, totals, balances, summaries, or obvious non-transaction metadata
- If the CSV has separate debit/credit columns, handle accordingly
- If amount is negative, it's an expense (make amount positive). If positive, it's income.
- Use type "transfer" only when the movement is clearly between the selected account and another known account or wallet
- For incoming transfer rows on the selected account, set selected_account_role to "destination"
- For outgoing transfer rows on the selected account, set selected_account_role to "source"
- Be smart about category matching: "SUPERMARKET", "LIDL", "MERCADONA" -> Groceries, "UBER", "TAXI", "METRO" -> Transport, etc.
- Return ONLY a valid JSON array as the top-level value

Example:
[{"source_row":2,"date":"2024-01-15","description":"Transfer from N26","amount":45.30,"type":"transfer","category_id":null,"label_ids":[],"transfer_account_id":"acc-123","selected_account_role":"destination","notes":""}]`;
}

async function parseWithGemini(prompt: string, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: transactionSchema,
      temperature: 0.2,
    },
  });

  const text = result.response.text();
  const jsonStr = extractJsonPayload(text);
  return JSON.parse(jsonStr);
}

async function parseWithOllama(prompt: string, model: string) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: ollamaTransactionFormat,
      options: {
        temperature: 0.2,
      },
    }),
  });

  const rawText = await response.text();
  let payload: { response?: string; error?: string } | null = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as { response?: string; error?: string };
    } catch {
      throw new Error("Ollama returned a non-JSON response");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Ollama request failed with status ${response.status}`);
  }

  if (!payload?.response || payload.response.trim().length === 0) {
    throw new Error("Ollama returned an empty response");
  }

  const jsonStr = extractJsonPayload(payload.response);
  return JSON.parse(jsonStr);
}

export async function POST(request: NextRequest) {
  let provider: ParserProvider = "gemini";

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Server environment variables are incomplete" },
        { status: 500 }
      );
    }

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      csvContent,
      categories,
      labels,
      accounts,
      accountId,
      selectedAccountName,
      provider: requestedProvider,
    } =
      (await request.json()) as ParseRequestBody;

    provider = normalizeProvider(requestedProvider);

    if (!csvContent || !accountId) {
      return NextResponse.json(
        { error: "Missing csvContent or accountId" },
        { status: 400 }
      );
    }

    if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is missing on the server. Switch to Ollama Gemma or Ollama Qwen, or configure Gemini.",
        },
        { status: 500 }
      );
    }

    // Limit CSV size to prevent abuse (max ~500KB)
    if (csvContent.length > 500_000) {
      return NextResponse.json(
        { error: "File too large. Max 500KB of CSV content." },
        { status: 400 }
      );
    }

    const categoryList = (categories ?? [])
      .map((c) => `- ${c.name} (${c.type}, id: ${c.id})`)
      .join("\n");
    const labelList = (labels ?? [])
      .map((label) => `- ${label.name} (id: ${label.id})`)
      .join("\n");
    const accountList = (accounts ?? [])
      .map((account) => `- ${account.name}${account.bank_name ? ` (${account.bank_name})` : ""} [${account.type}] (id: ${account.id})`)
      .join("\n");

    const { header, dataRows } = parseCsvRows(csvContent);

    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: "The CSV file does not contain any data rows." },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(
      categoryList,
      labelList || "- none",
      accountList || "- none",
      selectedAccountName ?? accountId,
      header,
      dataRows
    );
    const rawTransactions = isOllamaProvider(provider)
      ? await parseWithOllama(prompt, getOllamaModel(provider))
      : await parseWithGemini(prompt, process.env.GEMINI_API_KEY!);

    const transactions = normalizeTransactionsPayload(rawTransactions);

    if (!transactions) {
      return NextResponse.json(
        { error: "AI returned invalid format" },
        { status: 500 }
      );
    }

    const validated = enrichTransactions(
      sanitizeTransactions(
      transactions as ParsedAiTransaction[],
      categories ?? [],
      labels ?? [],
      accounts ?? []
      ),
      categories ?? [],
      labels ?? [],
      accounts ?? []
    );

    if (validated.length === 0) {
      const fallbackTransactions = enrichTransactions(parseTransactionsDeterministically(
        header,
        dataRows,
        categories ?? [],
        labels ?? [],
        accounts ?? []
      ), categories ?? [], labels ?? [], accounts ?? []);

      if (fallbackTransactions.length > 0) {
        return NextResponse.json({ transactions: fallbackTransactions });
      }

      return NextResponse.json(
        {
          error:
            "The AI could not extract any transactions from this file. Check that the file is a bank CSV with dates and amounts.",
        },
        { status: 400 }
      );
    }

    const fallbackThreshold = Math.max(3, Math.floor(dataRows.length / 2));
    console.log(`[parse] AI validated=${validated.length}, dataRows=${dataRows.length}, fallbackThreshold=${fallbackThreshold}`);

    if (validated.length < fallbackThreshold) {
      const fallbackTransactions = enrichTransactions(parseTransactionsDeterministically(
        header,
        dataRows,
        categories ?? [],
        labels ?? [],
        accounts ?? []
      ), categories ?? [], labels ?? [], accounts ?? []);
      console.log(`[parse] fallback got=${fallbackTransactions.length}`);

      // Use fallback if it extracts more, or if AI got 0
      if (fallbackTransactions.length > validated.length || validated.length === 0) {
        return NextResponse.json({ transactions: fallbackTransactions });
      }
    }

    return NextResponse.json({ transactions: validated });
  } catch (error) {
    console.error(`Import parse error (${provider}):`, error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error:
            isOllamaProvider(provider)
              ? `${getProviderLabel(provider)} returned invalid JSON while parsing this file. Try again or use a smaller/cleaner CSV export.`
              : "The AI returned an invalid response while parsing this file. Try again or use a smaller/cleaner CSV export.",
        },
        { status: 502 }
      );
    }

    if (isOllamaProvider(provider) && error instanceof TypeError) {
      return NextResponse.json(
        {
          error: `Ollama is not reachable at ${OLLAMA_BASE_URL}. Make sure Ollama is running and model ${getOllamaModel(provider)} is available.`,
        },
        { status: 502 }
      );
    }

    if (error instanceof GoogleGenerativeAIError) {
      return NextResponse.json(
        {
          error:
            "The AI parser is unavailable right now. Check GEMINI_API_KEY and try again in a moment.",
        },
        { status: 502 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : isOllamaProvider(provider)
          ? `Failed to parse CSV with ${getProviderLabel(provider)}`
          : "Failed to parse CSV with AI";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
