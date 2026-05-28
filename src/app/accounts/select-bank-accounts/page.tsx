"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { CheckCircle2, Circle, Landmark } from "lucide-react";

interface BankAccount {
  uid: string;
  iban: string;
  name: string;
  currency: string;
}

export default function SelectBankAccountsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const accountId = searchParams.get("accountId") || "";
  const connectionId = searchParams.get("connectionId") || "";
  const sessionId = searchParams.get("sessionId") || "";
  const institution = searchParams.get("institution") || "Bank";

  let bankAccounts: BankAccount[] = [];
  try {
    bankAccounts = JSON.parse(searchParams.get("accounts") || "[]");
  } catch {
    bankAccounts = [];
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function toggleAccount(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/accounts?error=unauthorized");
        return;
      }

      const res = await fetch("/api/banking/link-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          originalAccountId: accountId,
          connectionId,
          sessionId,
          institution,
          selectedAccounts: bankAccounts.filter((a) => selected.has(a.uid)),
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        router.push(`/accounts?error=${encodeURIComponent(error)}`);
      } else {
        router.push("/accounts?connected=multi");
      }
    } catch (err) {
      router.push(`/accounts?error=${encodeURIComponent(err instanceof Error ? err.message : "Unknown")}`);
    } finally {
      setLoading(false);
    }
  }

  if (bankAccounts.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center pt-12 lg:pt-0">
        <p className="text-gray-500">No bank accounts found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Select Bank Accounts</h1>
        <p className="mt-1 text-sm text-gray-500">
          {institution} gave access to {bankAccounts.length} accounts.
          Select which ones you want to track:
        </p>
      </div>

      <div className="space-y-3">
        {bankAccounts.map((account) => (
          <Card
            key={account.uid}
            onClick={() => toggleAccount(account.uid)}
            className={`cursor-pointer transition ${
              selected.has(account.uid)
                ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                : "hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {selected.has(account.uid) ? (
                <CheckCircle2 className="h-5 w-5 text-indigo-600" />
              ) : (
                <Circle className="h-5 w-5 text-gray-300" />
              )}
              <Landmark className="h-5 w-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {account.name || "Account"}
                </p>
                <p className="text-xs text-gray-500">
                  {account.iban ? formatIBAN(account.iban) : "No IBAN"} · {account.currency}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => router.push("/accounts")}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0 || loading}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Linking..." : `Link ${selected.size} Account${selected.size !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

function formatIBAN(iban: string): string {
  // Show last 4 chars masked: **** **** **** 1234
  if (iban.length <= 4) return iban;
  return "•••• " + iban.slice(-4);
}
