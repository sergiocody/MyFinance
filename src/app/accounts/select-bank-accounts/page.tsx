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
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-[var(--color-secondary)]">No bank accounts found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="font-label text-[11px] text-[var(--color-secondary)]">Linking</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--color-primary)] sm:text-3xl">
          Select Bank Accounts
        </h1>
        <p className="mt-1 text-sm text-[var(--color-secondary)]">
          {institution} gave access to {bankAccounts.length} accounts. Select which ones you want
          to track:
        </p>
      </div>

      <div className="space-y-3">
        {bankAccounts.map((account) => {
          const isSelected = selected.has(account.uid);
          return (
            <Card
              key={account.uid}
              onClick={() => toggleAccount(account.uid)}
              className={`cursor-pointer transition ${
                isSelected
                  ? "!border-[var(--color-tertiary)] !bg-[rgba(184,66,46,0.06)]"
                  : "hover:!border-[var(--color-border-strong)]"
              }`}
            >
              <div className="flex items-center gap-3">
                {isSelected ? (
                  <CheckCircle2 className="h-5 w-5 text-[var(--color-tertiary)]" />
                ) : (
                  <Circle className="h-5 w-5 text-[var(--color-secondary)]" />
                )}
                <Landmark className="h-5 w-5 text-[var(--color-secondary)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-primary)]">
                    {account.name || "Account"}
                  </p>
                  <p className="truncate text-xs text-[var(--color-secondary)]">
                    {account.iban ? formatIBAN(account.iban) : "No IBAN"} · {account.currency}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button
          onClick={() => router.push("/accounts")}
          className="btn btn-secondary flex-1"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0 || loading}
          className="btn btn-primary flex-1"
        >
          {loading ? "Linking..." : `Link ${selected.size} Account${selected.size !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

function formatIBAN(iban: string): string {
  if (iban.length <= 4) return iban;
  return "•••• " + iban.slice(-4);
}
