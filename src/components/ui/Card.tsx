"use client";

import { cn } from "@/lib/cn";

export default function Card(props: {
  children: React.ReactNode;
  className?: string;
  variant?: "surface1" | "surface2";
}) {
  const { children, className, variant = "surface1" } = props;
  const bg = variant === "surface2" ? "bg-[var(--bc-surface-2)]" : "bg-[var(--bc-surface-1)]";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--bc-border)]/90 p-5 backdrop-blur-sm",
        bg,
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-80 [background:linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_45%)]" />
      <div className="pointer-events-none absolute left-4 top-4 h-3 w-3 border-l border-t border-[var(--bc-hud-line)]" />
      <div className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--bc-hud-line)]" />
      <div className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--bc-hud-line)]" />
      <div className="pointer-events-none absolute bottom-4 right-4 h-3 w-3 border-b border-r border-[var(--bc-hud-line)]" />
      <div className="relative">{children}</div>
    </div>
  );
}
