import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * POST /api/banking/link-accounts
 * Links multiple bank accounts from a single authorization session.
 * For each selected bank account:
 * - If it's the original account: updates its bank_connection
 * - For additional accounts: creates new MyFinance account + bank_connection
 *
 * Body: { originalAccountId, connectionId, sessionId, institution, selectedAccounts[] }
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

    const { originalAccountId, connectionId, sessionId, institution, selectedAccounts } =
      await request.json();

    if (!originalAccountId || !connectionId || !sessionId || !selectedAccounts?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get the original account to copy properties
    const { data: originalAccount } = await authClient
      .from("accounts")
      .select("*")
      .eq("id", originalAccountId)
      .single();

    if (!originalAccount) {
      return NextResponse.json({ error: "Original account not found" }, { status: 404 });
    }

    const sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const linked: string[] = [];

    for (let i = 0; i < selectedAccounts.length; i++) {
      const bankAccount = selectedAccounts[i];

      if (i === 0) {
        // First selected account: update the original account's bank_connection
        await authClient
          .from("bank_connections")
          .update({
            external_account_uid: bankAccount.uid,
            session_id: sessionId,
            session_expires_at: sessionExpiresAt,
            status: "linked",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connectionId);

        // Update the original account name if bank provides one
        if (bankAccount.name || bankAccount.iban) {
          const accountName = bankAccount.name || `${institution} ${bankAccount.iban.slice(-4)}`;
          await authClient
            .from("accounts")
            .update({
              name: accountName,
              currency: bankAccount.currency || originalAccount.currency,
              bank_name: institution,
              iban: bankAccount.iban || null,
            })
            .eq("id", originalAccountId);
        }

        linked.push(originalAccountId);
      } else {
        // Additional accounts: create a new MyFinance account + bank_connection
        const accountName = bankAccount.name || `${institution} ${bankAccount.iban ? bankAccount.iban.slice(-4) : `#${i + 1}`}`;

        const { data: newAccount, error: accError } = await authClient
          .from("accounts")
          .insert({
            name: accountName,
            type: originalAccount.type,
            currency: bankAccount.currency || originalAccount.currency,
            bank_name: institution,
            iban: bankAccount.iban || null,
            color: originalAccount.color,
            account_mode: "automated",
            initial_balance: 0,
            current_balance: 0,
          })
          .select("id")
          .single();

        if (accError || !newAccount) {
          console.error("[link-accounts] failed to create account:", accError);
          continue;
        }

        // Create bank_connection for the new account
        const { error: connError } = await authClient.from("bank_connections").insert({
          user_id: user.id,
          account_id: newAccount.id,
          institution_id: `${institution}__linked`,
          institution_name: institution,
          session_id: sessionId,
          session_expires_at: sessionExpiresAt,
          external_account_uid: bankAccount.uid,
          status: "linked",
        });

        if (connError) {
          console.error("[link-accounts] failed to create bank_connection:", connError);
          // Clean up the orphaned account
          await authClient.from("accounts").delete().eq("id", newAccount.id);
          continue;
        }

        linked.push(newAccount.id);
      }
    }

    return NextResponse.json({ linked, count: linked.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
