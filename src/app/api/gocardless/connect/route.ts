import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRequisition } from "@/lib/gocardless";
import type { Database } from "@/lib/database.types";

/**
 * POST /api/gocardless/connect
 * Creates a GoCardless requisition and returns the bank authorization link.
 *
 * Body: { accountId, institutionId, institutionName }
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

    const authClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId, institutionId, institutionName } = await request.json();

    if (!accountId || !institutionId) {
      return NextResponse.json(
        { error: "Missing accountId or institutionId" },
        { status: 400 }
      );
    }

    // Verify the account belongs to the user and is automated
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

    // Build the redirect URL for the callback
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectUrl = `${appUrl}/api/gocardless/callback?account_id=${accountId}`;

    // Create GoCardless requisition
    const requisition = await createRequisition(user.id, institutionId, redirectUrl);

    // Upsert bank_connections record
    const serviceClient = createClient<Database>(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await serviceClient.from("bank_connections").upsert(
      {
        user_id: user.id,
        account_id: accountId,
        institution_id: institutionId,
        institution_name: institutionName || null,
        requisition_id: requisition.id,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

    return NextResponse.json({ link: requisition.link, requisitionId: requisition.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
