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
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden bg-white shadow-2xl",
          mobileSheet
            ? "h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-[28px]"
            : "max-h-[90vh] rounded-xl",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
