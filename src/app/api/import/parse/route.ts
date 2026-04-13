import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, GoogleGenerativeAIError, SchemaType } from "@google/generative-ai";
import Papa from "papaparse";

type ParserProvider = "gemini" | "ollama";

type CategoryOption = {
  name: string;
  type: string;
  id: string;
};

type ParsedAiTransaction = {
  source_row?: unknown;
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  type?: unknown;
  category_id?: unknown;
  notes?: unknown;
};

type StructuredCsvRow = {
  row_number: number;
  columns: Record<string, string>;
  raw_values: string[];
};

type ParseRequestBody = {
  csvContent?: string;
  categories?: CategoryOption[];
  accountId?: string;
  provider?: ParserProvider;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

const transactionSchema = {
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
      notes: { type: SchemaType.STRING },
    },
    required: ["date", "description", "amount", "type", "notes"],
  },
} as const;

function extractJsonPayload(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("AI returned an empty response");
  }

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  return trimmed;
}

function sanitizeTransactions(transactions: ParsedAiTransaction[]) {
  return transactions
    .filter((transaction) => {
      const amount = Number(transaction.amount);
      return transaction.date && Number.isFinite(amount) && amount > 0;
    })
    .map((transaction) => ({
      date: String(transaction.date),
      description: String(transaction.description ?? ""),
      amount: Number(transaction.amount),
      type: transaction.type === "income" ? "income" : "expense",
      category_id:
        typeof transaction.category_id === "string" && transaction.category_id.length > 0
          ? transaction.category_id
          : null,
      notes: String(transaction.notes ?? ""),
    }));
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

function buildPrompt(categoryList: string, header: string[], dataRows: StructuredCsvRow[]) {
  return `You are a financial data parser. Analyze this bank CSV export and extract transactions.

Available categories:
${categoryList}

CSV header columns:
${header.join(" | ")}

Candidate CSV rows (${dataRows.length} rows, first 200 max):
${JSON.stringify(dataRows.slice(0, 200), null, 2)}

Parse each source row into a transaction. For each transaction, determine:
0. "source_row" - the original CSV row number from the input above
1. "date" - in YYYY-MM-DD format. Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY
2. "description" - the payee or memo from the bank
3. "amount" - always positive number. Handle comma as decimal separator (European format) and dot as thousands separator if needed
4. "type" - "income" if money is received/positive, "expense" if money is spent/negative
5. "category_id" - match the description to the best category from the list above. Use null if unsure
6. "notes" - any additional info from the CSV row

Important rules:
- Return one JSON object per source row that represents a real transaction
- Do not merge multiple source rows into one output object
- Skip only rows that are empty, totals, balances, summaries, or obvious non-transaction metadata
- If the CSV has separate debit/credit columns, handle accordingly
- If amount is negative, it's an expense (make amount positive). If positive, it's income.
- Be smart about category matching: "SUPERMARKET", "LIDL", "MERCADONA" -> Groceries, "UBER", "TAXI", "METRO" -> Transport, etc.
- Return ONLY a valid JSON array as the top-level value

Example:
[{"source_row":2,"date":"2024-01-15","description":"LIDL Store","amount":45.30,"type":"expense","category_id":"abc-123","notes":""}]`;
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

async function parseWithOllama(prompt: string) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: "json",
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

    const { csvContent, categories, accountId, provider: requestedProvider } =
      (await request.json()) as ParseRequestBody;

    provider = requestedProvider === "ollama" ? "ollama" : "gemini";

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
            "GEMINI_API_KEY is missing on the server. Switch to Ollama Gemma or configure Gemini.",
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

    const { header, dataRows } = parseCsvRows(csvContent);

    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: "The CSV file does not contain any data rows." },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(categoryList, header, dataRows);
    const transactions =
      provider === "ollama"
        ? await parseWithOllama(prompt)
        : await parseWithGemini(prompt, process.env.GEMINI_API_KEY!);

    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "AI returned invalid format" },
        { status: 500 }
      );
    }

    const validated = sanitizeTransactions(transactions as ParsedAiTransaction[]);

    if (validated.length === 0) {
      return NextResponse.json(
        {
          error:
            "The AI could not extract any transactions from this file. Check that the file is a bank CSV with dates and amounts.",
        },
        { status: 400 }
      );
    }

    if (validated.length < Math.max(3, Math.floor(dataRows.length / 2))) {
      return NextResponse.json(
        {
          error: `Only ${validated.length} transactions were extracted from ${dataRows.length} CSV rows. The parser likely did not understand the file format well enough.`,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ transactions: validated });
  } catch (error) {
    console.error(`Import parse error (${provider}):`, error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error:
            provider === "ollama"
              ? "Ollama returned invalid JSON while parsing this file. Try again or use a smaller/cleaner CSV export."
              : "The AI returned an invalid response while parsing this file. Try again or use a smaller/cleaner CSV export.",
        },
        { status: 502 }
      );
    }

    if (provider === "ollama" && error instanceof TypeError) {
      return NextResponse.json(
        {
          error: `Ollama is not reachable at ${OLLAMA_BASE_URL}. Make sure Ollama is running and model ${OLLAMA_MODEL} is available.`,
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
        : provider === "ollama"
          ? "Failed to parse CSV with Ollama Gemma"
          : "Failed to parse CSV with AI";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
