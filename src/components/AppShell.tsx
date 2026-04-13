"use client";

import Sidebar from "@/components/Sidebar";
import AuthScreen from "@/components/AuthScreen";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { hasSupabaseConfig } from "@/lib/supabase";

function AppShellContent({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (!hasSupabaseConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-lg rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Supabase configuration missing</h1>
          <p className="mt-3 text-sm text-gray-600">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using the app.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <Sidebar />
      <main className="lg:pl-64">
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