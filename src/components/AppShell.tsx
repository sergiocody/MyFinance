"use client";

import Sidebar from "@/components/Sidebar";
import AuthScreen from "@/components/AuthScreen";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { hasSupabaseConfig } from "@/lib/supabase";

function AppShellContent({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (!hasSupabaseConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="surface-card-strong max-w-lg rounded-lg p-8">
          <p className="font-label text-[11px] text-[var(--color-secondary)]">Configuration</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--color-primary)]">Supabase configuration missing</h1>
          <p className="mt-3 text-sm text-[var(--color-secondary)]">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using the app.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-tertiary)] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <Sidebar />
      <main className="min-h-screen lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShellContent>{children}</AppShellContent>
    </AuthProvider>
  );
}