import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { startAuthorization } from "@/lib/enablebanking";
import type { Database } from "@/lib/database.types";

/**
 * POST /api/banking/connect
 * Starts the Enable Banking authorization flow.
 * Returns a URL to redirect the user to the bank's consent page.
 *
 * Body: { accountId, aspspName, aspspCountry }
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

    const { accountId, aspspName, aspspCountry } = await request.json();

    if (!accountId || !aspspName || !aspspCountry) {
      return NextResponse.json(
        { error: "Missing accountId, aspspName, or aspspCountry" },
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

    // Build the redirect URL and a unique state parameter
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectUrl = `${appUrl}/api/banking/callback`;
    const state = `${accountId}`;

    // Start Enable Banking authorization
    const { url, authorization_id } = await startAuthorization({
      aspspName,
      aspspCountry,
      redirectUrl,
      state,
    });

    // Upsert bank_connections record (using authClient — RLS passes since user_id = auth.uid())
    const { error: upsertError } = await authClient.from("bank_connections").upsert(
      {
        user_id: user.id,
        account_id: accountId,
        institution_id: `${aspspName}__${aspspCountry}`,
        institution_name: aspspName,
        authorization_id,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

    if (upsertError) {
      console.error("[connect] upsert bank_connections failed:", JSON.stringify(upsertError));
      return NextResponse.json(
        { error: `Failed to save bank connection: ${upsertError.message} (${upsertError.code})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ url, authorizationId: authorization_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
