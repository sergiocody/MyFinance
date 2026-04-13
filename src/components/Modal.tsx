"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl",
          size === "sm" && "w-full max-w-sm",
          size === "md" && "w-full max-w-lg",
          size === "lg" && "w-full max-w-2xl"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
