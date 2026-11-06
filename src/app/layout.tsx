import type { Metadata, Viewport } from "next";
import { Public_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "MyFinance - Personal Finance Tracker",
  description: "Track your accounts, expenses, and income with smart AI-powered imports",
};

export const viewport: Viewport = {
  themeColor: "#f7f5f2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${publicSans.variable} ${spaceGrotesk.variable} h-full`}>
        {children}
      </body>
    </html>
  );
}
