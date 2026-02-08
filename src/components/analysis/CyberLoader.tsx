"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  status: string;
  progressPct?: number; // 0..100 (optional)
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CyberLoader({ status, progressPct }: Props) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (typeof progressPct === "number" && Number.isFinite(progressPct)) return;
    const t = setInterval(() => {
      setPct((p) => {
        // Ease out near the end to feel less linear.
        const jump = p > 85 ? 1 : p > 60 ? 2 : 3;
        return Math.min(99, p + jump);
      });
    }, 120);
    return () => clearInterval(t);
  }, [progressPct]);

  const shownPct =
    typeof progressPct === "number" && Number.isFinite(progressPct)
      ? clamp(Math.floor(progressPct), 0, 100)
      : pct;

  const lines = useMemo(
    () => [
      "OSINT footprint indexing",
      "PII hint correlation",
      "Behavior pattern inference",
      "Attack path simulation",
    ],
    [],
  );

  return (
    <div className="w-full max-w-xl">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-sm">
        <div className="bc-anim-scan pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_bottom,transparent,rgba(255,255,255,0.10),transparent)] animate-[scan_2.2s_linear_infinite]" />

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-zinc-400">Blind Challenge Engine</div>
            <div className="mt-1 text-lg font-semibold text-white">
              분석 중…
            </div>
            <div className="mt-2 text-sm text-zinc-300">{status}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-400">PROGRESS</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-white">
              {shownPct}%
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="relative h-full">
              <div
                className="h-full bg-[linear-gradient(90deg,rgba(255,255,255,0.20),rgba(255,255,255,0.92),rgba(255,255,255,0.35))] transition-[width] duration-150"
                style={{ width: `${shownPct}%` }}
              />
              <div
                className="bc-anim-sweep pointer-events-none absolute inset-y-0 left-0 w-full opacity-70"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
                  backgroundSize: "220px 100%",
                  animation: "sweep 1.2s linear infinite",
                  transform: "translateX(-40%)",
                }}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
            {lines.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--bc-accent)]/80" />
                <span className="font-mono">{l}</span>
              </div>
            ))}
          </div>
        </div>

        <style jsx>{`
          @keyframes scan {
            0% {
              transform: translateY(-60%);
            }
            100% {
              transform: translateY(160%);
            }
          }
          @keyframes sweep {
            0% {
              background-position: -220px 0;
            }
            100% {
              background-position: calc(100% + 220px) 0;
            }
          }
        `}</style>
      </div>

      <div className="mt-4 text-center text-xs text-zinc-400">
        실제 서비스에서는 공개 게시물 기반으로 분석합니다. 개인 정보를 서버에
        저장하지 않도록 설계합니다.
      </div>
    </div>
  );
}
