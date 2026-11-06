import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MyFinance",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="label-caps tap-target -ml-2 mb-8 inline-flex items-center gap-1 rounded-sm px-2 text-[var(--color-tertiary)] transition-colors duration-150 hover:text-[var(--color-tertiary-hover)]"
      >
        <span aria-hidden>←</span>
        MyFinance
      </Link>
      {children}
    </main>
  );
}
