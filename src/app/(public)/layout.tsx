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
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <a
            href="/"
            className="label-caps tap-target -ml-2 mb-8 inline-flex items-center rounded-sm px-2 text-[var(--color-tertiary)] transition-colors duration-150 hover:text-[var(--color-tertiary-hover)]"
          >
            ← MyFinance
          </a>
          {children}
        </div>
      </body>
    </html>
  );
}
