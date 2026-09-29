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
    if (!open) return undefined;

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
      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
        <div className="flex min-h-10 flex-wrap items-center gap-2 p-2">
          {selectedLabels.length === 0 ? (
            <span className="text-xs text-[var(--color-secondary)]">No labels selected</span>
          ) : (
            selectedLabels.map((label) => (
              <span
                key={label.id}
                className="chip"
                style={{ backgroundColor: `${label.color}20`, color: label.color }}
              >
                {label.name}
                <button
                  type="button"
                  onClick={() => removeLabel(label.id)}
                  className="pressable hit-area -mr-1 rounded-full p-0.5 hover:bg-black/10"
                  aria-label={`Remove ${label.name}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="pressable tap-target flex w-full items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-primary)]"
        >
          <span className="truncate">
            {selectedLabels.length > 0
              ? `${selectedLabels.length} label${selectedLabels.length === 1 ? "" : "s"} selected`
              : "Choose one or more labels"}
          </span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 flex-none transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="surface-card-strong absolute left-0 top-full z-20 mt-2 w-full rounded-md p-1 sm:w-64">
          {labels.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--color-secondary)]">No labels available</p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {labels.map((label) => {
                const selected = selectedIds.includes(label.id);

                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => toggleLabel(label.id)}
                    aria-pressed={selected}
                    className={`pressable tap-target flex w-full items-center gap-2 rounded-sm px-3 text-left text-sm ${
                      selected
                        ? "bg-[rgba(184,66,46,0.10)] text-[var(--color-tertiary)]"
                        : "text-[var(--color-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-primary)]"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-none rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 truncate">{label.name}</span>
                    {selected && <Check className="h-4 w-4 flex-none" aria-hidden />}
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
