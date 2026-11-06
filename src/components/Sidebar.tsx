"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Download,
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
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Accounts", href: "/accounts", icon: Wallet },
  { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
  { name: "Categories", href: "/categories", icon: FolderOpen },
  { name: "Labels", href: "/labels", icon: Tag },
  { name: "Export", href: "/export", icon: Download },
  { name: "Import", href: "/import", icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const activeName =
    navigation.find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/" && pathname.startsWith(item.href))
    )?.name ?? "MyFinance";

  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    const openButton = openButtonRef.current;
    const desktop = window.matchMedia("(min-width: 64rem)");

    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    desktop.addEventListener("change", closeOnDesktop);

    return () => {
      document.body.style.overflow = original;
      desktop.removeEventListener("change", closeOnDesktop);
      if (!desktop.matches) openButton?.focus();
    };
  }, [mobileOpen]);

  function handleDrawerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!mobileOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setMobileOpen(false);
      return;
    }

    if (event.key !== "Tab" || !drawerRef.current) return;

    const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <>
      {/* Mobile top app bar */}
      <header
        inert={mobileOpen}
        className="surface-card-strong fixed inset-x-0 top-0 z-30 flex h-15 items-center justify-between gap-3 border-b border-[var(--color-border)] px-2 lg:hidden"
      >
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          className="btn btn-ghost btn-icon"
        >
          <Menu size={20} aria-hidden />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <Image
            src="/Myfinance.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 flex-none object-contain"
          />
          <div className="min-w-0 leading-tight">
            <p className="label-caps">Heritage</p>
            <span className="block truncate text-sm font-semibold tracking-tight text-[var(--color-primary)]">
              {activeName}
            </span>
          </div>
        </div>
        <div className="w-11 flex-none" aria-hidden />
      </header>

      {/* Drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(26,28,30,0.32)] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        ref={drawerRef}
        id="app-sidebar"
        aria-label="Navigation"
        onKeyDown={handleDrawerKeyDown}
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-[var(--color-border)] bg-[rgba(247,245,242,0.96)] text-[var(--color-primary)] shadow-[24px_0_48px_rgba(26,28,30,0.06)] backdrop-blur duration-200 ease-in-out motion-reduce:transition-none lg:visible lg:w-64 lg:translate-x-0",
          // Visibility flips instantly on open (so focus can move in) and only after the slide-out on close.
          mobileOpen
            ? "visible translate-x-0 transition-transform"
            : "invisible -translate-x-full transition-[transform,visibility] lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-4 pl-5 pr-3 lg:h-20 lg:px-6">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden">
            <Image
              src="/Myfinance.png"
              alt="MyFinance Logo"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label-caps">Heritage</p>
            <span className="text-lg font-semibold tracking-tight">MyFinance</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="btn btn-ghost btn-icon lg:hidden"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "pressable tap-target flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-[var(--color-tertiary)] text-[var(--color-neutral)]"
                    : "text-[var(--color-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-primary)]"
                )}
              >
                <item.icon className="h-5 w-5 flex-none" aria-hidden />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--color-border)] px-5 py-4 lg:px-6">
          <p className="truncate text-sm text-[var(--color-primary)]">{user?.email}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="label-caps">MyFinance v1.0</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="btn btn-ghost btn-sm -mr-3"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
