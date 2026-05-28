import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSession } from "@/lib/enablebanking";
import type { Database } from "@/lib/database.types";

/**
 * GET /api/banking/callback?code=...&state=...
 * Enable Banking redirects here after the user authorizes the bank connection.
 * Exchanges the code for a session and stores the linked account UID.
 * Then redirects the user back to the accounts page.
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

    // Use the first account's UID
    const linkedAccount = session.accounts[0];
    const accountUid = linkedAccount.uid;

    // Calculate session expiry (default 90 days from now if not available from session data)
    const sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    await dbClient.rpc("update_bank_connection_session", {
      p_connection_id: connection.id,
      p_external_account_uid: accountUid,
      p_session_id: session.session_id,
      p_session_expires_at: sessionExpiresAt,
      p_status: "linked",
      p_error_message: null,
    });

    return NextResponse.redirect(`${appUrl}/accounts?connected=${accountId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Banking callback error:", message);
    return NextResponse.redirect(`${appUrl}/accounts?error=callback_failed`);
  }
}
