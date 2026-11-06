"use client";

import { useId, useLayoutEffect, useRef } from "react";
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

export default function Modal({ open, ...props }: ModalProps) {
  if (!open) return null;

  return <ModalDialog {...props} />;
}

function ModalDialog({
  onClose,
  title,
  children,
  size = "md",
  mobileSheet = false,
  bodyClassName,
}: Omit<ModalProps, "open">) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Native modal dialog gives top-layer stacking, an inert background, focus containment and Escape.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;

    root.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();

    return () => {
      root.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Handle Escape explicitly: native close-watcher behaviour varies across browsers.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      className={cn(
        "fixed inset-0 m-0 hidden h-full max-h-none w-full max-w-none justify-center overflow-hidden border-0 bg-transparent p-0 text-[var(--color-primary)] backdrop:bg-transparent open:flex sm:px-4",
        mobileSheet ? "items-end sm:items-center" : "items-center px-4"
      )}
    >
      <div className="fixed inset-0 bg-[rgba(26,28,30,0.48)]" onClick={onClose} aria-hidden />
      <div
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
            <X size={20} aria-hidden />
          </button>
        </div>
        <div
          className={cn(
            "overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6",
            bodyClassName
          )}
        >
          {children}
        </div>
      </div>
    </dialog>
  );
}
