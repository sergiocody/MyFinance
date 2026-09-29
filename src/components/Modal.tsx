"use client";

import { useId } from "react";
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
  const titleId = useId();

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center sm:px-4",
        mobileSheet ? "items-end sm:items-center" : "items-center px-4"
      )}
    >
      <div className="fixed inset-0 bg-[rgba(26,28,30,0.48)]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "surface-card-strong relative z-10 flex w-full flex-col overflow-hidden",
          mobileSheet
            ? "h-dvh max-h-dvh rounded-none sm:h-auto sm:max-h-[90dvh] sm:rounded-md"
            : "max-h-[90dvh] rounded-md",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl"
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-3 pl-4 pr-2 sm:pl-6 sm:pr-4">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold text-[var(--color-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost btn-icon"
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
