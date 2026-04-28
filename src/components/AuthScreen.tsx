"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { isSignUpEnabled } from "@/lib/supabase";

type AuthMode = "signin" | "signup";

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const signUpAvailable = isSignUpEnabled;
  const isSignUpMode = signUpAvailable && mode === "signup";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (isSignUpMode && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      if (!isSignUpMode) {
        const signInError = await signIn(email, password);
        if (signInError) {
          setError(signInError);
        }
        return;
      }

      const result = await signUp(email, password);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.needsEmailConfirmation) {
        setNotice("Account created. Confirm your email if confirmation is enabled in Supabase, then sign in.");
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        return;
      }

      setNotice("Account created and signed in.");
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(184,66,46,0.12),_transparent_28%),linear-gradient(180deg,_#faf8f4_0%,_#f7f5f2_100%)] px-4 py-10">
      <div className="surface-card-strong w-full max-w-md rounded-lg p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-lg bg-[var(--color-primary)] p-3 text-[var(--color-neutral)]">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <p className="font-label text-[11px] text-[var(--color-secondary)]">Heritage Access</p>
            <h1 className="text-2xl font-semibold text-[var(--color-primary)]">MyFinance</h1>
            <p className="text-sm text-[var(--color-secondary)]">Private finance tracking with Supabase auth</p>
          </div>
        </div>

        {signUpAvailable ? (
          <div className="mb-6 grid grid-cols-2 rounded-lg border border-[var(--color-border)] bg-[rgba(26,28,30,0.04)] p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={mode === "signin" ? "rounded-md bg-white px-3 py-2 text-[var(--color-primary)] shadow-sm" : "px-3 py-2 text-[var(--color-secondary)]"}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={mode === "signup" ? "rounded-md bg-white px-3 py-2 text-[var(--color-primary)] shadow-sm" : "px-3 py-2 text-[var(--color-secondary)]"}
            >
              Create Account
            </button>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-[rgba(184,66,46,0.18)] bg-[rgba(184,66,46,0.08)] px-4 py-3 text-sm text-[var(--color-tertiary)]">
            Invite-only access is enabled. Create your owner account in Supabase Auth, then sign in here.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-primary)] outline-none transition focus:border-[var(--color-tertiary)] focus:ring-2 focus:ring-[rgba(184,66,46,0.14)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-primary)] outline-none transition focus:border-[var(--color-tertiary)] focus:ring-2 focus:ring-[rgba(184,66,46,0.14)]"
              placeholder="At least 8 characters"
            />
          </div>

          {isSignUpMode && (
            <div>
              <label className="font-label mb-2 block text-[11px] text-[var(--color-secondary)]">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-primary)] outline-none transition focus:border-[var(--color-tertiary)] focus:ring-2 focus:ring-[rgba(184,66,46,0.14)]"
                placeholder="Repeat password"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-[rgba(184,66,46,0.18)] bg-[rgba(184,66,46,0.08)] px-4 py-3 text-sm text-[var(--color-tertiary)]">{error}</div>
          )}

          {notice && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[rgba(26,28,30,0.04)] px-4 py-3 text-sm text-[var(--color-primary)]">{notice}</div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="accent-button w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {isPending ? "Please wait..." : isSignUpMode ? "Create Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}