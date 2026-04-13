import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, GoogleGenerativeAIError, SchemaType } from "@google/generative-ai";

type ParsedAiTransaction = {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  type?: unknown;
  category_id?: unknown;
  notes?: unknown;
};

const transactionSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const { csvContent, categories, accountId } = await request.json();

    if (!csvContent || !accountId) {
      return NextResponse.json(
        { error: "Missing csvContent or accountId" },
        { status: 400 }
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
      .map((c: { name: string; type: string; id: string }) => `- ${c.name} (${c.type}, id: ${c.id})`)
      .join("\n");

    const prompt = `You are a financial data parser. Analyze this bank CSV export and extract transactions.

Available categories:
${categoryList}

CSV content (first 200 rows max):
\`\`\`
${csvContent.split("\n").slice(0, 201).join("\n")}
\`\`\`

Parse each row into a transaction. For each transaction, determine:
1. "date" - in YYYY-MM-DD format. Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY
2. "description" - the payee or memo from the bank
3. "amount" - always positive number. Handle comma as decimal separator (European format) and dot as thousands separator if needed
4. "type" - "income" if money is received/positive, "expense" if money is spent/negative
5. "category_id" - match the description to the best category from the list above. Use null if unsure
6. "notes" - any additional info from the CSV row

Important rules:
- Skip header rows
- Skip empty rows or summary/total rows
- If the CSV has separate debit/credit columns, handle accordingly
- If amount is negative, it's an expense (make amount positive). If positive, it's income.
- Be smart about category matching: "SUPERMARKET", "LIDL", "MERCADONA" -> Groceries, "UBER", "TAXI", "METRO" -> Transport, etc.

Return ONLY a valid JSON array of objects. No markdown, no explanations. Example:
[{"date":"2024-01-15","description":"LIDL Store","amount":45.30,"type":"expense","category_id":"abc-123","notes":""}]`;

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
    const transactions = JSON.parse(jsonStr);

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

    return NextResponse.json({ transactions: validated });
  } catch (error) {
    console.error("Import parse error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error:
            "The AI returned an invalid response while parsing this file. Try again or use a smaller/cleaner CSV export.",
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

    const message = error instanceof Error ? error.message : "Failed to parse CSV with AI";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
