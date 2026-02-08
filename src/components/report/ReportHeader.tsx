"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Tag from "@/components/ui/Tag";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function riskLabel(score: number | null) {
  if (score == null) return { label: "부분 리포트", tone: "neutral" as const };
  if (score >= 75) return { label: "높음", tone: "danger" as const };
  if (score >= 45) return { label: "주의", tone: "warn" as const };
  return { label: "낮음", tone: "ok" as const };
}

function buildShareText(url?: string | null) {
  const lines = [
    "내 네이버 블로그가 공격자에게 어떻게 보이는지 30초만에 점검해볼 수 있어요.",
    "Blind Challenge: 블챌/주간일기 공개 글의 OSINT 위험 신호를 연결해 보여주는 리포트",
  ];
  if (url) lines.push(url);
  return lines.join("\n");
}

function formatUTC(isoLike: string) {
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return isoLike;
  // Stable across SSR/CSR: always UTC ISO (no locale/timezone ambiguity).
  return d.toISOString().replace("T", " ").replace(".000Z", "Z");
}

export default function ReportHeader(props: {
  blogId: string;
  demo?: boolean;
  category?: { categoryNo: number; categoryName: string } | null;
  riskScore?: number | null;
  generatedAt?: string | null;
}) {
  const { blogId, demo = false, category = null, riskScore = null, generatedAt = null } =
    props;
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  const r = useMemo(() => riskLabel(typeof riskScore === "number" ? riskScore : null), [riskScore]);
  const shownScore =
    typeof riskScore === "number" && Number.isFinite(riskScore) ? clamp(riskScore, 0, 100) : null;

  return (
    <div className="sticky top-0 z-40 -mx-6 border-b border-[var(--bc-border)] bg-[rgba(4,7,13,0.78)] px-6 py-4 backdrop-blur-md sm:-mx-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl border border-[var(--bc-border)] bg-black/20 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {demo ? <Tag tone="accent">DEMO</Tag> : null}
                  {category?.categoryName ? (
                    <Tag className="max-w-[70vw] truncate" tone="neutral">
                      {category.categoryName}{" "}
                      <span className="text-white/55">#{category.categoryNo}</span>
                    </Tag>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="font-mono text-[10px] tracking-[0.22em] text-white/55">
                    TARGET
                  </div>
                  <div className="font-mono text-base font-semibold text-white">
                    {blogId}
                  </div>
                </div>

                {generatedAt ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-white/55">
                    <span className="font-mono tracking-[0.18em]">CREATED</span>
                    <span className="font-mono text-zinc-300">
                      {formatUTC(generatedAt)}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="hidden h-10 w-px bg-white/10 sm:block" />

              <div className="shrink-0">
                <div className="font-mono text-[10px] tracking-[0.22em] text-white/55">
                  RISK
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <div className="font-mono text-xl font-semibold text-white">
                    {shownScore == null ? "-" : `${Math.round(shownScore)}/100`}
                  </div>
                  <Tag tone={r.tone}>{r.label}</Tag>
                  {shownScore != null ? (
                    <div className="ml-1 pb-0.5">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-[rgba(255,255,255,0.72)]"
                          style={{ width: `${Math.max(0, Math.min(100, shownScore))}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push("/")}
            title="홈으로 돌아가 다른 ID를 분석합니다."
            className="border-transparent bg-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5 hover:text-white"
          >
            다른 ID
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                const url = typeof window !== "undefined" ? window.location.href : null;
                await navigator.clipboard.writeText(buildShareText(url));
                setToast("공유 문구를 복사했어요.");
              } catch {
                setToast("복사에 실패했어요.");
              }
            }}
          >
            공유
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => router.push(`/analysis?blogId=${encodeURIComponent(blogId)}`)}
            title="같은 대상 ID로 새로 분석합니다."
          >
            다시 분석
          </Button>
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2">
          <div className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-center text-sm text-zinc-100 backdrop-blur-sm">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
