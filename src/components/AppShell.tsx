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
        <div className="surface-card-strong max-w-lg rounded-md p-6 sm:p-8">
          <p className="label-caps">Configuration</p>
          <h1 className="page-title mt-2">
            Supabase configuration missing
          </h1>
          <p className="mt-3 text-sm text-[var(--color-secondary)]">
            Set <code translate="no">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code translate="no">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> before using the app.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-tertiary)] border-t-transparent"
        />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <a
        href="#main"
        className="btn btn-ink sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60]"
      >
        Skip to Content
      </a>
      <Sidebar />
      <main id="main" tabIndex={-1} className="app-content min-h-screen focus:outline-none lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
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
