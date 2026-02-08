"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", ...props },
  ref,
) {
  const base =
    "bc-focus inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-60 disabled:pointer-events-none";
  const sizes =
    size === "sm"
      ? "rounded-lg px-3 py-2 text-sm"
      : "rounded-xl px-4 py-2.5 text-sm";

  const v =
    variant === "primary"
      ? [
          // Monochrome CTA: white fill on black UI for immediate affordance.
          "border border-white/80",
          "bg-white text-black",
          "hover:bg-white/90",
        ].join(" ")
      : variant === "ghost"
        ? "border border-[var(--bc-border)] bg-transparent text-zinc-200 hover:bg-white/5 hover:text-white"
        : "border border-[var(--bc-border)] bg-[rgba(255,255,255,0.03)] text-white hover:bg-[rgba(255,255,255,0.06)]";

  return (
    <button ref={ref} className={cn(base, sizes, v, className)} {...props} />
  );
});

export default Button;
