"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      if (mode === "signin") {
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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#dbeafe,_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl bg-indigo-600 p-3 text-white">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MyFinance</h1>
            <p className="text-sm text-gray-500">Private finance tracking with Supabase auth</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-2xl bg-gray-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={mode === "signin" ? "rounded-2xl bg-white px-3 py-2 text-gray-900 shadow-sm" : "px-3 py-2 text-gray-500"}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={mode === "signup" ? "rounded-2xl bg-white px-3 py-2 text-gray-900 shadow-sm" : "px-3 py-2 text-gray-500"}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="At least 8 characters"
            />
          </div>

          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Repeat password"
              />
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {notice && (
            <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isPending ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}