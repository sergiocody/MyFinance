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

    const normalizeIban = (value?: string | null) =>
      (value || "").replace(/\s+/g, "").toUpperCase();
    const normalizeCurrency = (value?: string | null) =>
      (value || "").trim().toUpperCase();

    // A reconnect is any account that was already linked before (it has an external UID or a
    // non-fresh status). Those must ALWAYS end up linked again — never sent to the selection
    // page — while a brand-new "pending" connection may still onboard multiple accounts.
    const isReconnect =
      Boolean(connection.external_account_uid) ||
      connection.status === "linked" ||
      connection.status === "expired" ||
      connection.status === "error";

    // Fetch the user's other connections at this institution so a single reconnect can refresh
    // every account the re-authorization covered (matched by IBAN, the only stable identifier
    // across Enable Banking sessions).
    const { data: siblings, error: siblingsError } = await dbClient.rpc(
      "get_sibling_bank_connections",
      { p_account_id: accountId }
    );

    if (siblingsError) {
      console.error("[callback] get_sibling_bank_connections failed:", siblingsError.message);
    }

    console.log(
      `[callback] account=${accountId} isReconnect=${isReconnect} session_accounts=${session.accounts.length} siblings=${siblings?.length ?? 0}`
    );

    const connectionByIban = new Map<string, NonNullable<typeof siblings>[number]>();
    for (const sib of siblings ?? []) {
      const iban = normalizeIban(sib.iban);
      if (iban) connectionByIban.set(iban, sib);
    }

    const matchedConnectionIds = new Set<string>();
    const unmatchedAccounts = [...session.accounts];

    const linkConnection = async (
      connectionId: string,
      bankAccount: (typeof session.accounts)[number]
    ) => {
      await dbClient.rpc("update_bank_connection_session", {
        p_connection_id: connectionId,
        p_external_account_uid: bankAccount.uid,
        p_session_id: session.session_id,
        p_session_expires_at: sessionExpiresAt,
        p_status: "linked",
        p_error_message: null,
      });

      if (bankAccount.account_id?.iban) {
        await dbClient.rpc("update_connected_account_iban", {
          p_connection_id: connectionId,
          p_iban: bankAccount.account_id.iban,
        });
      }

      matchedConnectionIds.add(connectionId);
    };

    // 1) Match each account the session returned to an existing connection by IBAN and refresh
    //    them all. IBANs are globally unique, so this is always safe and is what lets one
    //    reconnect update every sibling account at once.
    for (let i = unmatchedAccounts.length - 1; i >= 0; i--) {
      const bankAccount = unmatchedAccounts[i];
      const iban = normalizeIban(bankAccount.account_id?.iban);
      const sibling = iban ? connectionByIban.get(iban) : undefined;

      if (!sibling) continue;

      await linkConnection(sibling.connection_id, bankAccount);
      unmatchedAccounts.splice(i, 1);
    }

    // 2) Match remaining accounts by currency, but ONLY within the same institution and ONLY
    //    when it is unambiguous (exactly one still-unmatched connection and one still-unmatched
    //    session account share that currency). This safely re-links multi-currency accounts that
    //    have no stored IBAN yet (e.g. Revolut EUR vs GBP) WITHOUT ever guessing by position —
    //    guessing by order is what previously cross-linked accounts and mixed their balances.
    const anchorInstitution = connection.institution_name ?? null;
    for (let i = unmatchedAccounts.length - 1; i >= 0; i--) {
      const bankAccount = unmatchedAccounts[i];
      const currency = normalizeCurrency(bankAccount.currency);
      if (!currency) continue;

      const candidateConnections = (siblings ?? []).filter(
        (s) =>
          !matchedConnectionIds.has(s.connection_id) &&
          (s.institution_name ?? null) === anchorInstitution &&
          normalizeCurrency(s.currency) === currency
      );
      const accountsWithCurrency = unmatchedAccounts.filter(
        (a) => normalizeCurrency(a.currency) === currency
      );

      if (candidateConnections.length === 1 && accountsWithCurrency.length === 1) {
        await linkConnection(candidateConnections[0].connection_id, bankAccount);
        unmatchedAccounts.splice(i, 1);
      }
    }

    // 3) Last-resort guaranteed link ONLY for the unambiguous single-account case: the session
    //    returned exactly one account and the connection the user clicked is still unmatched.
    //    There is nothing to confuse it with, so linking is safe. We never do this when several
    //    accounts remain, to avoid positional mislinking.
    if (
      !matchedConnectionIds.has(connection.id) &&
      session.accounts.length === 1 &&
      unmatchedAccounts.length === 1
    ) {
      await linkConnection(connection.id, unmatchedAccounts.shift()!);
    }

    if (matchedConnectionIds.size > 0) {
      console.log(
        `[callback] linked ${matchedConnectionIds.size} connection(s) for account=${accountId}`
      );

      // Preserve the original wording for a genuine first-time single-account connection.
      if (!isReconnect && session.accounts.length === 1) {
        return NextResponse.redirect(`${appUrl}/accounts?connected=${accountId}`);
      }

      return NextResponse.redirect(
        `${appUrl}/accounts?reconnected=${matchedConnectionIds.size}&session=${session.accounts.length}&unmatched=${unmatchedAccounts.length}`
      );
    }

    // A reconnect that matched nothing must NOT be downgraded to "pending" (that would make an
    // already-linked account look disconnected and could re-trigger the selection flow). Leave
    // the connection status untouched and report the mismatch so the user can fix the IBAN.
    if (isReconnect) {
      console.warn(
        `[callback] reconnect matched no accounts for account=${accountId} (session_accounts=${session.accounts.length})`
      );
      return NextResponse.redirect(
        `${appUrl}/accounts?reconnected=0&session=${session.accounts.length}&unmatched=${unmatchedAccounts.length}`
      );
    }

    // Brand-new connection returning multiple accounts: let the user pick which ones to track.
    await dbClient.rpc("update_bank_connection_session", {
      p_connection_id: connection.id,
      p_external_account_uid: "", // will be set after selection
      p_session_id: session.session_id,
      p_session_expires_at: sessionExpiresAt,
      p_status: "pending",
      p_error_message: null,
    });

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
