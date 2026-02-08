"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";

export default function Modal(props: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  /**
   * If true, clicking the backdrop closes the modal.
   * Defaults to true for this MVP flow.
   */
  closeOnBackdrop?: boolean;
}) {
  const { open, title, children, onClose, className, closeOnBackdrop = true } =
    props;

  const titleId = useId();
  const lastActiveRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const root = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  useEffect(() => {
    if (!open) return;

    lastActiveRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // Focus the modal panel for keyboard navigation (simple trap via focusable panel).
    const t = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = prevOverflow;
      // Restore focus.
      lastActiveRef.current?.focus?.();
      lastActiveRef.current = null;
    };
  }, [onClose, open]);

  if (!open || !root) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
        aria-label="Close modal"
        onClick={() => {
          if (!closeOnBackdrop) return;
          onClose();
        }}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          [
            "relative w-full max-w-3xl outline-none",
            "rounded-2xl border border-[var(--bc-border)] bg-[rgba(4,7,13,0.92)]",
            "shadow-[0_30px_120px_rgba(0,0,0,0.70)]",
          ].join(" "),
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div
              id={titleId}
              className="truncate text-sm font-semibold text-white"
            >
              {title}
            </div>
          </div>
          <button
            type="button"
            className="bc-focus rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    root,
  );
}

