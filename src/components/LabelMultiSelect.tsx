"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { Label } from "@/lib/database.types";

type LabelMultiSelectProps = {
  labels: Label[];
  selectedIds: string[];
  onChange: (labelIds: string[]) => void;
};

export function LabelMultiSelect({ labels, selectedIds, onChange }: LabelMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedLabels = labels.filter((label) => selectedIds.includes(label.id));

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  function toggleLabel(labelId: string) {
    onChange(
      selectedIds.includes(labelId)
        ? selectedIds.filter((id) => id !== labelId)
        : [...selectedIds, labelId]
    );
  }

  function removeLabel(labelId: string) {
    onChange(selectedIds.filter((id) => id !== labelId));
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-2">
          {selectedLabels.length === 0 ? (
            <span className="text-[11px] text-gray-400">No labels selected</span>
          ) : (
            selectedLabels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `${label.color}20`, color: label.color }}
              >
                {label.name}
                <button
                  type="button"
                  onClick={() => removeLabel(label.id)}
                  className="rounded-full p-0.5 transition hover:bg-black/10"
                  aria-label={`Remove ${label.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between border-t border-gray-100 px-2 py-1.5 text-[11px] font-medium text-gray-500 transition hover:bg-gray-50"
        >
          <span>
            {selectedLabels.length > 0
              ? `${selectedLabels.length} label${selectedLabels.length === 1 ? "" : "s"} selected`
              : "Choose one or more labels"}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white p-1 shadow-lg sm:w-64">
          {labels.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No labels available</p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {labels.map((label) => {
                const selected = selectedIds.includes(label.id);

                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => toggleLabel(label.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                      selected ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 truncate">{label.name}</span>
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}