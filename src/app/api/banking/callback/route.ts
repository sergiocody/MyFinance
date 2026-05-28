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
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient<Database>(supabaseUrl, serviceKey);

    // Get the bank connection for this account
    const { data: connection, error: connError } = await serviceClient
      .from("bank_connections")
      .select("*")
      .eq("account_id", accountId)
      .single();

    if (connError || !connection) {
      console.error("[callback] connection_not_found for accountId:", accountId, "error:", connError);
      return NextResponse.redirect(`${appUrl}/accounts?error=connection_not_found`);
    }

    // Exchange code for a session
    const session = await createSession(code);

    if (!session.accounts || session.accounts.length === 0) {
      await serviceClient
        .from("bank_connections")
        .update({
          status: "error",
          error_message: "No accounts returned from bank authorization",
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return NextResponse.redirect(`${appUrl}/accounts?error=no_bank_accounts`);
    }

    // Use the first account's UID
    const linkedAccount = session.accounts[0];
    const accountUid = linkedAccount.uid;

    // Calculate session expiry (default 90 days from now if not available from session data)
    const sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    await serviceClient
      .from("bank_connections")
      .update({
        external_account_uid: accountUid,
        session_id: session.session_id,
        session_expires_at: sessionExpiresAt,
        status: "linked",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.redirect(`${appUrl}/accounts?connected=${accountId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Banking callback error:", message);
    return NextResponse.redirect(`${appUrl}/accounts?error=callback_failed`);
  }
}
