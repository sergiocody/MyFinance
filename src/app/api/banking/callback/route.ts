import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSession } from "@/lib/enablebanking";
import type { Database } from "@/lib/database.types";

/**
 * GET /api/banking/callback?code=...&state=...
 * Enable Banking redirects here after the user authorizes the bank connection.
 * Exchanges the code for a session, then:
 * - If only 1 account: auto-links it to the existing MyFinance account
 * - If multiple accounts: redirects to a selection page
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state"); // contains accountId
  const error = request.nextUrl.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  // Handle user cancellation or errors from the bank
  if (error) {
    const errorDesc = request.nextUrl.searchParams.get("error_description") || error;
    return NextResponse.redirect(`${appUrl}/accounts?error=${encodeURIComponent(errorDesc)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/accounts?error=missing_callback_params`);
  }

  const accountId = state;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const dbClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

    // Get the bank connection for this account (via SECURITY DEFINER function)
    const { data: connections, error: connError } = await dbClient
      .rpc("get_bank_connection_by_account", { p_account_id: accountId });

    const connection = connections?.[0];

    if (connError || !connection) {
      console.error("[callback] connection_not_found for accountId:", accountId, "error:", connError);
      return NextResponse.redirect(`${appUrl}/accounts?error=connection_not_found`);
    }

    // Exchange code for a session
    const session = await createSession(code);

    if (!session.accounts || session.accounts.length === 0) {
      await dbClient.rpc("set_bank_connection_error", {
        p_connection_id: connection.id,
        p_error_message: "No accounts returned from bank authorization",
      });

      return NextResponse.redirect(`${appUrl}/accounts?error=no_bank_accounts`);
    }

    // Calculate session expiry (default 90 days from now)
    const sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    if (session.accounts.length === 1) {
      // Single account: auto-link directly
      const linkedAccount = session.accounts[0];
      await dbClient.rpc("update_bank_connection_session", {
        p_connection_id: connection.id,
        p_external_account_uid: linkedAccount.uid,
        p_session_id: session.session_id,
        p_session_expires_at: sessionExpiresAt,
        p_status: "linked",
        p_error_message: null,
      });

      await dbClient
        .from("accounts")
        .update({ iban: linkedAccount.account_id?.iban || null })
        .eq("id", accountId);

      return NextResponse.redirect(`${appUrl}/accounts?connected=${accountId}`);
    }

    // Multiple accounts: store session info and redirect to selection page
    // We store session_id on the connection but leave it in "pending" so the user picks accounts
    await dbClient.rpc("update_bank_connection_session", {
      p_connection_id: connection.id,
      p_external_account_uid: "", // will be set after selection
      p_session_id: session.session_id,
      p_session_expires_at: sessionExpiresAt,
      p_status: "pending",
      p_error_message: null,
    });

    // Encode accounts info in URL for the selection page
    const bankAccounts = session.accounts.map(a => ({
      uid: a.uid,
      iban: a.account_id?.iban || "",
      name: a.name || "",
      currency: a.currency || "EUR",
    }));

    const encoded = encodeURIComponent(JSON.stringify(bankAccounts));
    return NextResponse.redirect(
      `${appUrl}/accounts/select-bank-accounts?accountId=${accountId}&connectionId=${connection.id}&sessionId=${session.session_id}&institution=${encodeURIComponent(connection.institution_name || connection.institution_id)}&accounts=${encoded}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Banking callback error:", message);
    return NextResponse.redirect(`${appUrl}/accounts?error=callback_failed`);
  }
}
