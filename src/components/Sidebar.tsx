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
        className="fixed top-4 left-4 z-50 rounded-lg bg-gray-900 p-2 text-white lg:hidden"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-64 flex-col bg-gray-900 text-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-800 px-6">
          <Wallet className="h-6 w-6 text-indigo-400" />
          <span className="text-lg font-bold">MyFinance</span>
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
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-800 px-6 py-4">
          <p className="truncate text-sm text-gray-300">{user?.email}</p>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">MyFinance v1.0</p>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 hover:text-white"
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
