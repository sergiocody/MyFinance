/**
 * Enable Banking API service layer.
 * Handles JWT authentication, ASPSP listing, authorization flow,
 * session management, and transaction fetching.
 *
 * Docs: https://enablebanking.com/docs/api/reference/
 * Base URL: https://api.enablebanking.com
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import * as crypto from "crypto";

const BASE_URL = "https://api.enablebanking.com";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// --- JWT Generation ---

/**
 * Generates a signed JWT (RS256) for authenticating with the Enable Banking API.
 * The JWT is short-lived (1 hour) and signed with the app's RSA private key.
 */
function generateJWT(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID;

  // Support both plain (with escaped \n) and Base64-encoded private key
  const privateKeyB64 = process.env.ENABLE_BANKING_PRIVATE_KEY_B64;
  const privateKeyRaw = privateKeyB64
    ? Buffer.from(privateKeyB64, "base64").toString("utf-8")
    : process.env.ENABLE_BANKING_PRIVATE_KEY;

  if (!appId || !privateKeyRaw) {
    throw new Error("Enable Banking credentials not configured (ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY)");
  }

  // Handle escaped newlines from env vars (plain key variant)
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour TTL

  const header = {
    typ: "JWT",
    alg: "RS256",
    kid: appId,
  };

  const payload = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// --- Types ---

export interface EnableBankingASPSP {
  name: string;
  country: string;
  logo: string;
  bic?: string;
  psu_types: string[];
  auth_methods: { name: string; approach: string; psu_type: string }[];
  maximum_consent_validity: number;
  beta: boolean;
}

export interface EnableBankingAccount {
  uid: string;
  account_id?: { iban?: string };
  name?: string;
  currency?: string;
  cash_account_type?: string;
  identification_hash: string;
}

export interface EnableBankingTransaction {
  entry_reference?: string;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
  note?: string;
  transaction_id?: string;
}

// --- API Helpers ---

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const jwt = generateJWT();
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Enable Banking GET ${path} failed: ${res.status} - ${body}`);
  }

  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const jwt = generateJWT();

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Enable Banking POST ${path} failed: ${res.status} - ${responseBody}`);
  }

  return res.json();
}

// --- Public API ---

/**
 * Lists available ASPSPs (banks) for a given country.
 */
export async function listASPSPs(country: string): Promise<EnableBankingASPSP[]> {
  const data = await apiGet<{ aspsps: EnableBankingASPSP[] }>("/aspsps", { country: country.toUpperCase() });
  return data.aspsps;
}

/**
 * Starts the authorization flow. Returns a URL to redirect the user to.
 */
export async function startAuthorization(params: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;
  validUntil?: string;
}): Promise<{ url: string; authorization_id: string }> {
  // Default consent validity: 90 days
  const validUntil = params.validUntil || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const data = await apiPost<{ url: string; authorization_id: string }>("/auth", {
    access: {
      valid_until: validUntil,
    },
    aspsp: {
      name: params.aspspName,
      country: params.aspspCountry,
    },
    state: params.state,
    redirect_url: params.redirectUrl,
    psu_type: "personal",
  });

  return data;
}

/**
 * Completes authorization by exchanging the callback code for a session.
 * Returns session_id and the list of accessible accounts.
 */
export async function createSession(code: string): Promise<{
  session_id: string;
  accounts: EnableBankingAccount[];
}> {
  const data = await apiPost<{
    session_id: string;
    accounts: EnableBankingAccount[];
  }>("/sessions", { code });

  return data;
}

/**
 * Gets session status and details.
 */
export async function getSession(sessionId: string): Promise<{
  status: string;
  accounts: string[];
  access: { valid_until: string };
}> {
  return apiGet(`/sessions/${sessionId}`);
}

/**
 * Fetches transactions for an account within a session.
 * Handles pagination via continuation_key.
 */
export async function getAccountTransactions(
  accountUid: string,
  dateFrom?: string,
  dateTo?: string,
  strategy?: "default" | "longest"
): Promise<EnableBankingTransaction[]> {
  const allTransactions: EnableBankingTransaction[] = [];
  let continuationKey: string | undefined;

  do {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (strategy) params.strategy = strategy;
    if (continuationKey) params.continuation_key = continuationKey;

    const data = await apiGet<{
      transactions: EnableBankingTransaction[];
      continuation_key?: string;
    }>(`/accounts/${accountUid}/transactions`, params);

    allTransactions.push(...data.transactions);
    continuationKey = data.continuation_key || undefined;
  } while (continuationKey);

  return allTransactions;
}

/**
 * Fetches account balances.
 */
export async function getAccountBalances(accountUid: string): Promise<{
  balances: { balance_amount: { currency: string; amount: string }; balance_type: string }[];
}> {
  return apiGet(`/accounts/${accountUid}/balances`);
}

// --- Transaction Sync Logic ---

/**
 * Derives the transaction type from the credit/debit indicator.
 */
function deriveTransactionType(indicator: "CRDT" | "DBIT"): "income" | "expense" {
  return indicator === "CRDT" ? "income" : "expense";
}

/**
 * Keywords that indicate a transaction is a transfer between own accounts.
 */
const TRANSFER_KEYWORDS = [
  "transferencia emitida",
  "transferencia recibida",
  "traspaso",
  "transfer to",
  "transfer from",
  "trasferencia",
  "trasp.",
];

/**
 * Checks if a description indicates a transfer between own accounts.
 */
function isTransferDescription(description: string): boolean {
  const lower = description.toLowerCase();
  return TRANSFER_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Extracts a human-readable description from an Enable Banking transaction.
 */
function extractDescription(tx: EnableBankingTransaction): string {
  if (tx.remittance_information?.length) {
    return tx.remittance_information.join(" ");
  }
  if (tx.creditor?.name) return tx.creditor.name;
  if (tx.debtor?.name) return tx.debtor.name;
  if (tx.note) return tx.note;
  return "Bank transaction";
}

export interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  totalFetched: number;
}

/**
 * Syncs transactions from Enable Banking for a connected account.
 */
export async function syncAccountTransactions(
  userId: string,
  accountId: string,
  client: SupabaseClient<Database>
): Promise<SyncResult> {
  const db = client;

  // Get bank connection details
  const { data: connection, error: connError } = await db
    .from("bank_connections")
    .select("*")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .single();

  if (connError || !connection) {
    throw new Error("Bank connection not found for this account");
  }

  if (connection.status !== "linked") {
    throw new Error(`Bank connection is not active (status: ${connection.status})`);
  }

  if (!connection.external_account_uid) {
    throw new Error("No bank account UID linked");
  }

  // Check if session is still valid
  if (connection.session_expires_at && new Date(connection.session_expires_at) < new Date()) {
    await db
      .from("bank_connections")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    throw new Error("Bank session has expired. Please reconnect your bank account.");
  }

  // First sync: try 2 years, fallback to 89 days if bank rejects
  // Subsequent syncs: fetch from last sync date minus 1 day overlap
  const isFirstSync = !connection.last_synced_at;
  let dateFrom: string;

  if (!isFirstSync) {
    dateFrom = new Date(new Date(connection.last_synced_at!).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  } else {
    dateFrom = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  }

  let transactions: EnableBankingTransaction[];
  try {
    transactions = await getAccountTransactions(
      connection.external_account_uid,
      dateFrom
    );
  } catch (err) {
    if (isFirstSync) {
      // Bank rejected long range, retry with 89 days
      console.log(`[sync] 2-year range failed, retrying with 89 days`);
      dateFrom = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      transactions = await getAccountTransactions(
        connection.external_account_uid,
        dateFrom
      );
    } else {
      throw err;
    }
  }

  console.log(`[sync] accountId=${accountId} fetched ${transactions.length} transactions, dateFrom=${dateFrom}`);

  // Load user's other accounts to match transfers
  const { data: userAccounts } = await db
    .from("accounts")
    .select("id, name, bank_name")
    .neq("id", accountId);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const tx of transactions) {
    // Only process booked transactions
    if (tx.status !== "BOOK") continue;

    const externalId = tx.entry_reference || tx.transaction_id || `${tx.booking_date}_${tx.transaction_amount.amount}_${extractDescription(tx).slice(0, 50)}`;
    const amount = Math.abs(parseFloat(tx.transaction_amount.amount));
    let type: "income" | "expense" | "transfer" = deriveTransactionType(tx.credit_debit_indicator);
    const description = extractDescription(tx);
    const date = tx.booking_date || tx.value_date || tx.transaction_date || new Date().toISOString().split("T")[0];

    // Detect transfers by description keywords
    let transferToAccountId: string | null = null;
    if (isTransferDescription(description) && tx.credit_debit_indicator === "DBIT") {
      type = "transfer";
      // Try to match destination account by name in description
      if (userAccounts) {
        const descLower = description.toLowerCase();
        const matched = userAccounts.find(a => {
          const nameWords = a.name.toLowerCase().split(/\s+/);
          return nameWords.some(word => word.length > 3 && descLower.includes(word));
        });
        if (matched) {
          transferToAccountId = matched.id;
        }
      }
    }

    const { error } = await db.from("transactions").insert({
      account_id: accountId,
      user_id: userId,
      type,
      amount,
      description,
      date,
      source: "sync",
      external_id: externalId,
      transfer_to_account_id: transferToAccountId,
    });

    if (error) {
      if (error.code === "23505") {
        skipped++;
      } else {
        errors.push(`${externalId}: ${error.message}`);
      }
    } else {
      imported++;
    }
  }

  // Fetch real balance from the bank and update account
  try {
    const { balances } = await getAccountBalances(connection.external_account_uid);
    // Prefer "closingBooked" or "expected", fallback to first available
    const preferred = balances.find(b => b.balance_type === "closingBooked")
      || balances.find(b => b.balance_type === "expected")
      || balances[0];
    if (preferred) {
      const bankBalance = parseFloat(preferred.balance_amount.amount);
      await db
        .from("accounts")
        .update({ current_balance: bankBalance, updated_at: new Date().toISOString() })
        .eq("id", accountId);
      console.log(`[sync] updated account balance from bank: ${bankBalance} ${preferred.balance_amount.currency} (type: ${preferred.balance_type})`);
    }
  } catch (balanceErr) {
    console.warn(`[sync] failed to fetch balance from bank:`, balanceErr);
  }

  // Update last synced timestamp
  await db
    .from("bank_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      status: "linked",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { imported, skipped, errors, totalFetched: transactions.length };
}
