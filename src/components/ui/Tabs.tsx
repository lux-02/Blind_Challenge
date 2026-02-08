"use client";

import { useId, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = {
  value: T;
  label: string;
};

export default function Tabs<T extends string>(props: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const { items, value, onChange, className } = props;
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const idx = useMemo(() => items.findIndex((i) => i.value === value), [items, value]);

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--bc-border)]/90 bg-[rgba(255,255,255,0.02)] p-1 backdrop-blur-sm",
        className,
      )}
      role="tablist"
      aria-label="Report tabs"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        const wrapped = (next + items.length) % items.length;
        const v = items[wrapped]?.value;
        if (!v) return;
        onChange(v);
        requestAnimationFrame(() => refs.current[wrapped]?.focus());
      }}
    >
      <div className="flex flex-wrap gap-1">
        {items.map((it, i) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${id}-${it.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(it.value)}
              className={cn(
                "bc-focus rounded-lg px-3 py-2 text-sm font-semibold transition",
                active
                  ? "bg-[rgba(255,255,255,0.08)] text-[var(--bc-text)]"
                  : "text-zinc-300 hover:bg-[rgba(255,255,255,0.04)] hover:text-white",
              )}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
