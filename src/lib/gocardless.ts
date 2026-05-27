/**
 * GoCardless Bank Account Data API service layer.
 * Handles token management, institution listing, requisition creation,
 * account fetching, and transaction syncing.
 *
 * Docs: https://developer.gocardless.com/bank-account-data/overview
 * Sandbox base URL: https://bankaccountdata.gocardless.com
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceKey);
}

// --- Types ---

export interface GocardlessInstitution {
  id: string;
  name: string;
  bic: string;
  transaction_total_days: string;
  countries: string[];
  logo: string;
}

export interface GocardlessRequisition {
  id: string;
  redirect: string;
  status: string;
  institution_id: string;
  link: string;
  accounts: string[];
}

export interface GocardlessTransaction {
  transactionId: string;
  bookingDate: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
  additionalInformation?: string;
}

export interface GocardlessAccountBalances {
  balances: {
    balanceAmount: { amount: string; currency: string };
    balanceType: string;
  }[];
}

// --- Token Management ---

async function getValidToken(userId: string): Promise<string> {
  const admin = getAdminClient();
  const { data: tokenRow } = await admin
    .from("gocardless_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  const now = new Date();

  // If we have a valid access token, use it
  if (tokenRow && new Date(tokenRow.access_expires_at) > now) {
    return tokenRow.access_token;
  }

  // If we have a valid refresh token, refresh
  if (tokenRow && new Date(tokenRow.refresh_expires_at) > now) {
    const res = await fetch(`${BASE_URL}/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: tokenRow.refresh_token }),
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status}`);
    }

    const data = await res.json();
    const accessExpires = new Date(now.getTime() + data.access_expires * 1000);

    await admin
      .from("gocardless_tokens")
      .update({
        access_token: data.access,
        access_expires_at: accessExpires.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return data.access;
  }

  // Otherwise, create a new token pair
  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;

  if (!secretId || !secretKey) {
    throw new Error("GoCardless API credentials not configured");
  }

  const res = await fetch(`${BASE_URL}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });

  if (!res.ok) {
    throw new Error(`Token creation failed: ${res.status}`);
  }

  const data = await res.json();
  const accessExpires = new Date(now.getTime() + data.access_expires * 1000);
  const refreshExpires = new Date(now.getTime() + data.refresh_expires * 1000);

  if (tokenRow) {
    await admin
      .from("gocardless_tokens")
      .update({
        access_token: data.access,
        access_expires_at: accessExpires.toISOString(),
        refresh_token: data.refresh,
        refresh_expires_at: refreshExpires.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } else {
    await admin.from("gocardless_tokens").insert({
      user_id: userId,
      access_token: data.access,
      access_expires_at: accessExpires.toISOString(),
      refresh_token: data.refresh,
      refresh_expires_at: refreshExpires.toISOString(),
    });
  }

  return data.access;
}

// --- Public API ---

export async function listInstitutions(
  userId: string,
  country: string
): Promise<GocardlessInstitution[]> {
  const token = await getValidToken(userId);

  const res = await fetch(`${BASE_URL}/institutions/?country=${encodeURIComponent(country)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list institutions: ${res.status}`);
  }

  return res.json();
}

export async function createRequisition(
  userId: string,
  institutionId: string,
  redirectUrl: string
): Promise<GocardlessRequisition> {
  const token = await getValidToken(userId);

  const res = await fetch(`${BASE_URL}/requisitions/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      user_language: "EN",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create requisition: ${res.status} - ${body}`);
  }

  return res.json();
}

export async function getRequisition(
  userId: string,
  requisitionId: string
): Promise<GocardlessRequisition> {
  const token = await getValidToken(userId);

  const res = await fetch(`${BASE_URL}/requisitions/${requisitionId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get requisition: ${res.status}`);
  }

  return res.json();
}

export async function getAccountBalances(
  userId: string,
  gocardlessAccountId: string
): Promise<GocardlessAccountBalances> {
  const token = await getValidToken(userId);

  const res = await fetch(`${BASE_URL}/accounts/${gocardlessAccountId}/balances/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get balances: ${res.status}`);
  }

  return res.json();
}

export async function getAccountTransactions(
  userId: string,
  gocardlessAccountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ booked: GocardlessTransaction[]; pending: GocardlessTransaction[] }> {
  const token = await getValidToken(userId);

  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);

  const queryString = params.toString();
  const url = `${BASE_URL}/accounts/${gocardlessAccountId}/transactions/${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get transactions: ${res.status}`);
  }

  const data = await res.json();
  return data.transactions;
}

// --- Transaction Sync Logic ---

/**
 * Derives the transaction type (income/expense) from the GoCardless amount.
 * Positive amounts = income, negative = expense.
 */
function deriveTransactionType(amount: string): "income" | "expense" {
  return parseFloat(amount) >= 0 ? "income" : "expense";
}

/**
 * Extracts a human-readable description from a GoCardless transaction.
 */
function extractDescription(tx: GocardlessTransaction): string {
  if (tx.remittanceInformationUnstructured) {
    return tx.remittanceInformationUnstructured;
  }
  if (tx.remittanceInformationUnstructuredArray?.length) {
    return tx.remittanceInformationUnstructuredArray.join(" ");
  }
  if (tx.creditorName) return tx.creditorName;
  if (tx.debtorName) return tx.debtorName;
  if (tx.additionalInformation) return tx.additionalInformation;
  return "Bank transaction";
}

export interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function syncAccountTransactions(
  userId: string,
  accountId: string
): Promise<SyncResult> {
  const admin = getAdminClient();

  // Get bank connection details
  const { data: connection, error: connError } = await admin
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

  if (!connection.gocardless_account_id) {
    throw new Error("No GoCardless account ID linked");
  }

  // Determine date range: from last sync or last 90 days
  const dateFrom = connection.last_synced_at
    ? new Date(connection.last_synced_at).toISOString().split("T")[0]
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { booked } = await getAccountTransactions(
    userId,
    connection.gocardless_account_id,
    dateFrom
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const tx of booked) {
    const externalId = tx.transactionId;
    const amount = Math.abs(parseFloat(tx.transactionAmount.amount));
    const type = deriveTransactionType(tx.transactionAmount.amount);
    const description = extractDescription(tx);
    const date = tx.bookingDate;

    const { error } = await admin.from("transactions").upsert(
      {
        account_id: accountId,
        user_id: userId,
        type,
        amount,
        description,
        date,
        source: "sync",
        external_id: externalId,
      },
      { onConflict: "account_id,external_id", ignoreDuplicates: true }
    );

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

  // Update last synced timestamp and status
  await admin
    .from("bank_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      status: "linked",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { imported, skipped, errors };
}
