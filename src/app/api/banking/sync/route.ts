import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncAccountTransactions } from "@/lib/enablebanking";
import type { Database } from "@/lib/database.types";

/**
 * POST /api/banking/sync
 * Triggers a manual sync of transactions for an automated account.
 *
 * Body: { accountId }
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    // Verify account belongs to user
    const { data: account, error: accError } = await authClient
      .from("accounts")
      .select("id, account_mode")
      .eq("id", accountId)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (account.account_mode !== "automated") {
      return NextResponse.json(
        { error: "Account is not configured as automated" },
        { status: 400 }
      );
    }

    const result = await syncAccountTransactions(user.id, accountId, authClient);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
