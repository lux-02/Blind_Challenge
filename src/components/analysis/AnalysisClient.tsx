"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CyberLoader from "@/components/analysis/CyberLoader";
import type { BlindReport } from "@/lib/types";
import { useVisionProgressive } from "@/components/report/useVisionProgressive";
import { notifyStorageChanged } from "@/lib/storageBus";
import Button from "@/components/ui/Button";
import Tag from "@/components/ui/Tag";

const STORAGE_KEY = "blindchallenge:latestReport";

type CategoryCandidate = {
  categoryNo: number;
  categoryName: string;
  postCnt: number;
};

function AnalysisStepper(props: { phase: string }) {
  const { phase } = props;
  const step =
    phase === "choose_category" || phase === "probing_categories"
      ? 2
      : phase === "calling_api" || phase === "storing"
        ? 3
        : phase === "vision_processing"
          ? 4
          : phase === "routing"
            ? 5
            : 1;

  const items = [
    { n: 1, label: "Target" },
    { n: 2, label: "Category" },
    { n: 3, label: "Text" },
    { n: 4, label: "Vision" },
    { n: 5, label: "Report" },
  ];

  return (
    <div className="rounded-xl border border-[var(--bc-border)] bg-black/20 p-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        {items.map((it) => (
          <div key={it.n} className="inline-flex items-center gap-2">
            <span
              className={[
                "inline-flex h-6 w-6 items-center justify-center rounded-md border font-mono",
                it.n <= step
                  ? "border-white/35 bg-[rgba(255,255,255,0.06)] text-white"
                  : "border-white/10 bg-white/5 text-zinc-300",
              ].join(" ")}
            >
              {it.n}
            </span>
            <span className={it.n === step ? "text-white font-semibold" : ""}>
              {it.label}
            </span>
            {it.n !== 5 ? <span className="text-zinc-500">/</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalysisClient({ blogId }: { blogId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<
    | "idle"
    | "probing_categories"
    | "choose_category"
    | "calling_api"
    | "storing"
    | "vision_processing"
    | "routing"
    | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CategoryCandidate[]>([]);
  const [selectedCategoryNo, setSelectedCategoryNo] = useState<number | null>(
    null,
  );
  const [recommendedCategoryNo, setRecommendedCategoryNo] = useState<number | null>(
    null,
  );
  const [report, setReport] = useState<BlindReport | null>(null);

  const vision = useVisionProgressive({ report, setReport });

  const status = useMemo(() => {
    switch (phase) {
      case "probing_categories":
        return "블챌 카테고리 탐지 중…";
      case "choose_category":
        return "분석할 카테고리를 선택해 주세요.";
      case "calling_api":
        return "게시물 수집 흐름 준비 중…";
      case "storing":
        return "위험 노드 그래프 구성 중…";
      case "vision_processing":
        return "이미지 단서 분석 중…";
      case "routing":
        return "리포트 렌더링 준비 중…";
      case "error":
        return "분석 실패";
      default:
        return "분석을 시작합니다…";
    }
  }, [phase]);

  const progressPct = useMemo(() => {
    if (phase !== "vision_processing") return undefined;
    const total = vision.progress.total;
    const processed = vision.progress.processed;
    if (!total) return 100;
    return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
  }, [phase, vision.progress.processed, vision.progress.total]);

  const runAnalyze = useCallback(
    async (categoryNo?: number | null) => {
    setPhase("calling_api");
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blogId,
        categoryNo: categoryNo ?? undefined,
      }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const report = (await res.json()) as BlindReport;
    setPhase("storing");
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(report));
      notifyStorageChanged("session", STORAGE_KEY);
    } catch {
      // ignore
    }
    setReport(report);

    const totalImages =
      typeof report?.vision?.totalImages === "number"
        ? report.vision.totalImages
        : (report?.contents ?? []).reduce((acc, c) => acc + (c.images?.length ?? 0), 0);
    if (totalImages > 0) {
      setPhase("vision_processing");
      return;
    }

    // No images: proceed immediately.
    const delay = 500 + Math.floor(Math.random() * 600);
    await new Promise((r) => setTimeout(r, delay));
    setPhase("routing");
    router.push(`/report?blogId=${encodeURIComponent(blogId)}`);
    },
    [blogId, router],
  );

  useEffect(() => {
    if (phase !== "vision_processing") return;
    if (!report) return;
    if (vision.state.kind === "error") return;

    const total = vision.progress.total;
    const done =
      report.vision?.status === "complete" ||
      (total > 0 && vision.progress.processed >= total);

    if (!done) return;

    // Briefly show 100% then route.
    const t = window.setTimeout(() => {
      setPhase("routing");
      router.push(`/report?blogId=${encodeURIComponent(blogId)}`);
    }, 450);
    return () => window.clearTimeout(t);
  }, [
    blogId,
    phase,
    report,
    router,
    vision.progress.processed,
    vision.progress.total,
    vision.state.kind,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setPhase("probing_categories");
        const res = await fetch("/api/naver/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blogId }),
        });

        if (cancelled) return;

        if (res.ok) {
          const json = (await res.json()) as {
            candidates?: CategoryCandidate[];
            recommendedCategoryNo?: number | null;
          };
          const list = Array.isArray(json.candidates) ? json.candidates : [];
          setCandidates(list);

          const rec =
            typeof json.recommendedCategoryNo === "number"
              ? json.recommendedCategoryNo
              : null;
          setRecommendedCategoryNo(rec);
          const defaultSel = rec ?? (list[0]?.categoryNo ?? null);
          setSelectedCategoryNo(defaultSel);

          if (list.length <= 1) {
            await runAnalyze(defaultSel);
            return;
          }

          setPhase("choose_category");
          return;
        }

        // If category probing fails, still attempt analysis (API will auto-pick / fallback).
        await runAnalyze(null);
      } catch (e) {
        if (cancelled) return;
        setPhase("error");
        setError(
          e instanceof Error
            ? `분석을 완료하지 못했어요: ${e.message}`
            : "분석을 완료하지 못했어요.",
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [blogId, runAnalyze]);

  if (!blogId) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10 sm:px-10">
        <h1 className="text-xl font-semibold text-white">분석을 시작할 수 없어요</h1>
        <p className="mt-3 text-sm text-zinc-300">
          blogId가 비어 있어요. 홈으로 돌아가서 다시 입력해 주세요.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.push("/")}>홈으로</Button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10 sm:px-10">
        <h1 className="text-xl font-semibold text-white">분석을 시작할 수 없어요</h1>
        <p className="mt-3 text-sm text-zinc-300">{error}</p>
        <div className="mt-6">
          <Button onClick={() => router.push("/")}>홈으로</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10 sm:px-10">
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="text-xs text-zinc-400">대상</div>
          <div className="font-mono text-sm text-zinc-200">{blogId}</div>
        </div>
        <div className="flex items-center gap-2">
          <Tag tone="accent">분석 진행 중</Tag>
          <Button size="sm" onClick={() => router.push("/")}>
            취소(홈)
          </Button>
        </div>
      </header>

      <div className="mt-4">
        <AnalysisStepper phase={phase} />
      </div>

      <main className="mt-10 flex flex-1 items-center justify-center">
        {phase === "choose_category" ? (
          <div className="w-full max-w-2xl">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="text-xs text-zinc-400">카테고리 탐지 결과</div>
              <h1 className="mt-2 text-lg font-semibold text-white">
                분석할 챌린지 카테고리를 선택해 주세요
              </h1>
              <p className="mt-2 text-sm text-zinc-300">
                블로그마다 블챌/주간일기 카테고리명이 다를 수 있어요.
              </p>

              <div className="mt-5 space-y-2">
                {(() => {
                  const max = Math.max(
                    1,
                    ...candidates.map((c) => (typeof c.postCnt === "number" ? c.postCnt : 0)),
                  );
                  return candidates.map((c) => (
                    <label
                      key={c.categoryNo}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3",
                        selectedCategoryNo === c.categoryNo
                          ? "border-white/45 bg-[rgba(255,255,255,0.06)]"
                          : "border-white/10 bg-black/20 hover:border-white/20",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="category"
                        className="mt-1"
                        checked={selectedCategoryNo === c.categoryNo}
                        onChange={() => setSelectedCategoryNo(c.categoryNo)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-sm font-semibold text-white">
                            {c.categoryName}
                          </div>
                          {recommendedCategoryNo === c.categoryNo ? (
                            <Tag tone="ok">추천</Tag>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-400">
                          categoryNo:{" "}
                          <span className="font-mono text-zinc-200">
                            {c.categoryNo}
                          </span>
                          {" / "}
                          게시물:{" "}
                          <span className="font-mono text-zinc-200">
                            {c.postCnt}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-[linear-gradient(90deg,rgba(255,255,255,0.28),rgba(255,255,255,0.92))]"
                            style={{
                              width: `${Math.max(
                                3,
                                Math.round(((c.postCnt ?? 0) / max) * 100),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </label>
                  ));
                })()}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      await runAnalyze(selectedCategoryNo);
                    } catch (e) {
                      setPhase("error");
                      setError(
                        e instanceof Error
                          ? `분석을 완료하지 못했어요: ${e.message}`
                          : "분석을 완료하지 못했어요.",
                      );
                    }
                  }}
                  disabled={!selectedCategoryNo}
                >
                  선택한 카테고리로 분석 시작
                </Button>
                <Button onClick={() => router.push("/")}>홈으로</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl">
            <CyberLoader status={status} progressPct={progressPct} />
            <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-zinc-300 backdrop-blur-sm">
              <summary className="cursor-pointer select-none text-zinc-200">
                자세히 보기
              </summary>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">phase</span>
                  <span className="font-mono text-zinc-200">{phase}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">status</span>
                  <span className="font-mono text-zinc-200">{status}</span>
                </div>
                {phase === "vision_processing" ? (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">vision</span>
                    <span className="font-mono text-zinc-200">
                      {vision.progress.processed}/{vision.progress.total}
                    </span>
                  </div>
                ) : null}
                {vision.state.kind === "rate_limited" ? (
                  <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-white/90">
                    rate limited:{" "}
                    <span className="font-mono text-white">
                      {Math.ceil(vision.state.retryAfterMs / 1000)}s
                    </span>
                  </div>
                ) : null}
              </div>
            </details>
            {phase === "vision_processing" && vision.progress.total ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-300 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    이미지 진행:{" "}
                    <span className="font-mono text-zinc-100">
                      {vision.progress.processed}/{vision.progress.total}
                    </span>
                  </div>
                  <div className="font-mono text-zinc-200">
                    {vision.state.kind === "rate_limited"
                      ? `rate limited (${Math.ceil(vision.state.retryAfterMs / 1000)}s)`
                      : vision.state.kind}
                  </div>
                </div>
                {vision.state.kind === "error" ? (
                  <div className="mt-3 rounded-xl border border-white/25 bg-white/5 p-3 text-sm text-white/90">
                    이미지 분석 중 오류:{" "}
                    <span className="font-mono">{vision.state.message}</span>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Button variant="primary" onClick={vision.resume}>
                        다시 시도
                      </Button>
                      <Button
                        onClick={() => {
                          setPhase("routing");
                          router.push(
                            `/report?blogId=${encodeURIComponent(blogId)}`,
                          );
                        }}
                      >
                        이미지 분석 건너뛰고 리포트로
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
