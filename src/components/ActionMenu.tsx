"use client";

import { Fragment, useEffect, useId, useRef } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type ActionMenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
};

const MENU_GAP = 4;

export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const detachRef = useRef<(() => void) | null>(null);

  useEffect(() => () => detachRef.current?.(), []);

  // Popovers render in the top layer, so position against the trigger to escape the table's overflow clipping.
  function handleBeforeToggle(event: React.ToggleEvent<HTMLDivElement>) {
    detachRef.current?.();
    detachRef.current = null;
    if (event.newState !== "open" || !triggerRef.current) return;

    const menu = event.currentTarget;
    const rect = triggerRef.current.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    const opensUp = rect.top > clientHeight / 2;
    menu.style.top = opensUp ? "auto" : `${rect.bottom + MENU_GAP}px`;
    menu.style.bottom = opensUp ? `${clientHeight - rect.top + MENU_GAP}px` : "auto";
    menu.style.right = `${clientWidth - rect.right}px`;
    menu.style.left = "auto";

    const close = () => menu.hidePopover();
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    detachRef.current = () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        aria-label={label}
        className="btn btn-ghost btn-icon"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        onBeforeToggle={handleBeforeToggle}
        className="m-0 min-w-44 rounded-md border border-[var(--color-border)] bg-white p-1 text-[var(--color-primary)] shadow-[0_8px_24px_rgba(26,28,30,0.12)]"
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <Fragment key={item.label}>
              {item.danger && index > 0 && (
                <hr className="my-1 border-[var(--color-border)]" />
              )}
              <button
                type="button"
                onClick={() => {
                  menuRef.current?.hidePopover();
                  item.onSelect();
                }}
                className={`pressable tap-target flex w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-medium ${
                  item.danger
                    ? "text-[var(--color-danger)] hover:bg-[rgba(184,66,46,0.08)]"
                    : "hover:bg-[var(--color-hover)]"
                }`}
              >
                <Icon
                  size={16}
                  aria-hidden
                  className={item.danger ? "" : "text-[var(--color-secondary)]"}
                />
                {item.label}
              </button>
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
