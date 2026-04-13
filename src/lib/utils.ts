import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function normalizeTransactionDescription(description: string | null | undefined) {
  return (description ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function createTransactionHash(input: {
  date: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  description: string | null | undefined;
}) {
  return [
    input.date,
    input.type,
    Number(input.amount).toFixed(2),
    normalizeTransactionDescription(input.description),
  ].join("|");
}
