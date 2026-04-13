import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const transactions = JSON.parse(jsonStr);

    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "AI returned invalid format" },
        { status: 500 }
      );
    }

    // Validate and sanitize each transaction
    const validated = transactions
      .filter(
        (t: Record<string, unknown>) =>
          t.date && typeof t.amount === "number" && t.amount > 0
      )
      .map((t: Record<string, unknown>) => ({
        date: String(t.date),
        description: String(t.description ?? ""),
        amount: Number(t.amount),
        type: t.type === "income" ? "income" : "expense",
        category_id: t.category_id || null,
        notes: String(t.notes ?? ""),
      }));

    return NextResponse.json({ transactions: validated });
  } catch (error) {
    console.error("Import parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse CSV with AI" },
      { status: 500 }
    );
  }
}
