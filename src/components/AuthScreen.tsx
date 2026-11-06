"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
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
      setError("Passwords do not match. Re-enter the same password in both fields.");
      document.getElementById("auth-confirm-password")?.focus();
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
    <div className="auth-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="surface-card-strong w-full max-w-md rounded-md p-6 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-md bg-transparent">
            <Image src="/Myfinance.png" alt="MyFinance Logo" width={48} height={48} className="h-12 w-12 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="label-caps">Heritage Access</p>
            <h1 className="page-title">MyFinance</h1>
            <p className="text-sm text-[var(--color-secondary)]">Private finance tracking with Supabase auth</p>
          </div>
        </div>

        {signUpAvailable ? (
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-md border border-[var(--color-border)] bg-[rgba(26,28,30,0.04)] p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setMode("signin")}
              aria-pressed={mode === "signin"}
              className={`pressable tap-target rounded-sm px-3 ${mode === "signin" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-secondary)] hover:text-[var(--color-primary)]"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              aria-pressed={mode === "signup"}
              className={`pressable tap-target rounded-sm px-3 ${mode === "signup" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-secondary)] hover:text-[var(--color-primary)]"}`}
            >
              Create Account
            </button>
          </div>
        ) : (
          <div className="notice notice-info mb-6">
            Invite-only access is enabled. Create your owner account in Supabase Auth, then sign in here.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="field-label">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "auth-error" : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="field-label">Password</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUpMode ? "new-password" : "current-password"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "auth-error" : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field"
              placeholder="At least 8 characters"
            />
          </div>

          {isSignUpMode && (
            <div>
              <label htmlFor="auth-confirm-password" className="field-label">Confirm Password</label>
              <input
                id="auth-confirm-password"
                name="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={error && password !== confirmPassword ? true : undefined}
                aria-describedby={error ? "auth-error" : undefined}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="field"
                placeholder="Repeat password"
              />
            </div>
          )}

          {error && (
            <div id="auth-error" role="alert" className="notice notice-danger">
              {error}
            </div>
          )}
          <div role="status">{notice && <div className="notice">{notice}</div>}</div>

          <button
            type="submit"
            disabled={isPending}
            className="btn btn-primary w-full font-semibold"
          >
            {isPending
              ? isSignUpMode
                ? "Creating Account…"
                : "Signing In…"
              : isSignUpMode
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}