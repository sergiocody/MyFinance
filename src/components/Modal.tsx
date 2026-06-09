"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  mobileSheet?: boolean;
  bodyClassName?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  mobileSheet = false,
  bodyClassName,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center sm:px-4",
        mobileSheet ? "items-end sm:items-center" : "items-center px-4"
      )}
    >
      <div className="fixed inset-0 bg-[rgba(26,28,30,0.48)]" onClick={onClose} />
      <div
        className={cn(
          "surface-card-strong relative z-10 flex w-full flex-col overflow-hidden",
          mobileSheet
            ? "h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-md"
            : "max-h-[90vh] rounded-md",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost px-2 py-2"
          >
            <X size={20} />
          </button>
        </div>
        <div className={cn("overflow-y-auto px-4 py-4 sm:px-6 sm:py-6", bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
