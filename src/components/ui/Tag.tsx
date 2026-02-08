"use client";

import { cn } from "@/lib/cn";

export default function Tag(props: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
}) {
  const { children, className, tone = "neutral" } = props;
  const t =
    tone === "danger"
      ? "border-white/50 bg-[rgba(255,255,255,0.08)] text-white"
    : tone === "warn"
      ? "border-white/40 bg-[rgba(255,255,255,0.06)] text-white/90"
    : tone === "ok"
      ? "border-white/28 bg-[rgba(255,255,255,0.04)] text-white/85"
    : tone === "accent"
      ? "border-white/45 bg-[rgba(255,255,255,0.06)] text-white"
      : "border-[var(--bc-border)] bg-[rgba(255,255,255,0.03)] text-white/80";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-[0.14em]",
        t,
        className,
      )}
    >
      {children}
    </span>
  );
}
