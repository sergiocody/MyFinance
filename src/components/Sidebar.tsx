"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  Wallet,
  ArrowRightLeft,
  Tag,
  FolderOpen,
  Upload,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Accounts", href: "/accounts", icon: Wallet },
  { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
  { name: "Categories", href: "/categories", icon: FolderOpen },
  { name: "Labels", href: "/labels", icon: Tag },
  { name: "Import", href: "/import", icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-[var(--color-border)] bg-[var(--color-tertiary)] p-2 text-[var(--color-neutral)] shadow-[var(--shadow-matte)] lg:hidden"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-[rgba(26,28,30,0.3)] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[rgba(247,245,242,0.94)] text-[var(--color-primary)] shadow-[24px_0_48px_rgba(26,28,30,0.06)] backdrop-blur transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-20 items-center gap-3 border-b border-[var(--color-border)] px-6">
          <div className="rounded-lg bg-[var(--color-primary)] p-2 text-[var(--color-neutral)]">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="font-label text-[10px] text-[var(--color-secondary)]">Heritage</p>
            <span className="text-lg font-semibold tracking-tight">MyFinance</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-tertiary)] text-[var(--color-neutral)]"
                    : "text-[var(--color-secondary)] hover:bg-[rgba(26,28,30,0.05)] hover:text-[var(--color-primary)]"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--color-border)] px-6 py-4">
          <p className="truncate text-sm text-[var(--color-primary)]">{user?.email}</p>
          <div className="mt-3 flex items-center justify-between">
            <p className="font-label text-[10px] text-[var(--color-secondary)]">MyFinance v1.0</p>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--color-secondary)] hover:bg-[rgba(26,28,30,0.05)] hover:text-[var(--color-primary)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
