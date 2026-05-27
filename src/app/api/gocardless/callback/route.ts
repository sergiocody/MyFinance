import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequisition } from "@/lib/gocardless";
import type { Database } from "@/lib/database.types";

/**
 * GET /api/gocardless/callback?account_id=...&ref=...
 * GoCardless redirects here after the user authorizes the bank connection.
 * Fetches the requisition status and stores the linked account IDs.
 * Then redirects the user back to the accounts page.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (!accountId) {
    return NextResponse.redirect(`${appUrl}/accounts?error=missing_account_id`);
  }

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
      return NextResponse.redirect(`${appUrl}/accounts?error=connection_not_found`);
    }

    if (!connection.requisition_id) {
      return NextResponse.redirect(`${appUrl}/accounts?error=no_requisition`);
    }

    // Fetch the requisition from GoCardless to get linked accounts
    const requisition = await getRequisition(connection.user_id!, connection.requisition_id);

    if (requisition.accounts.length === 0) {
      // User may have cancelled or bank didn't provide accounts
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

    // Use the first account (most common single-account scenario)
    const gocardlessAccountId = requisition.accounts[0];

    await serviceClient
      .from("bank_connections")
      .update({
        gocardless_account_id: gocardlessAccountId,
        status: "linked",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.redirect(`${appUrl}/accounts?connected=${accountId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GoCardless callback error:", message);
    return NextResponse.redirect(`${appUrl}/accounts?error=callback_failed`);
  }
}
