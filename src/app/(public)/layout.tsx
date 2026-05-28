import type { Metadata } from "next";
import { Public_Sans, Space_Grotesk } from "next/font/google";
import "../globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "MyFinance",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${publicSans.variable} ${spaceGrotesk.variable} h-full bg-[var(--color-neutral)]`}>
        <div className="mx-auto max-w-3xl px-6 py-16">
          <a
            href="/"
            className="font-label mb-10 block text-[11px] uppercase tracking-widest text-[var(--color-tertiary)]"
          >
            ← MyFinance
          </a>
          {children}
        </div>
      </body>
    </html>
  );
}
