"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CyberLoader from "@/components/analysis/CyberLoader";
import type { BlindReport } from "@/lib/types";
import { useVisionProgressive } from "@/components/report/useVisionProgressive";
import { notifyStorageChanged } from "@/lib/storageBus";
import Button from "@/components/ui/Button";
import Tag from "@/components/ui/Tag";
import Modal from "@/components/ui/Modal";

const STORAGE_KEY = "blindchallenge:latestReport";

type ReconCategory = {
  categoryNo: number;
  categoryName: string;
  postCnt: number;
  openYN: boolean;
  risk: "high" | "normal";
  riskReason?: string;
  isChallenge: boolean;
};

async function readApiErrorMessage(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as { message?: unknown; error?: unknown } | null;
    if (typeof json?.message === "string" && json.message.trim()) return json.message.trim();
    if (typeof json?.error === "string" && json.error.trim()) return json.error.trim();
  } catch {
    // ignore parse errors
  }
  return null;
}

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
  const [categories, setCategories] = useState<ReconCategory[]>([]);
  const [highRiskCount, setHighRiskCount] = useState<number>(0);
  const [reconWarnings, setReconWarnings] = useState<string[]>([]);
  const [selectedCategoryNos, setSelectedCategoryNos] = useState<number[]>([]);
  const [report, setReport] = useState<BlindReport | null>(null);

  const vision = useVisionProgressive({ report, setReport });

  const status = useMemo(() => {
    switch (phase) {
      case "probing_categories":
        return "카테고리 정찰 중…";
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
    async (categoryNos?: number[] | null) => {
    setPhase("calling_api");
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blogId,
        categoryNos: Array.isArray(categoryNos) && categoryNos.length ? categoryNos : undefined,
      }),
    });

    if (!res.ok) {
      const msg = await readApiErrorMessage(res);
      throw new Error(msg ?? `API error: ${res.status}`);
    }
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
        const res = await fetch("/api/naver/recon", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blogId }),
        });

        if (cancelled) return;

        if (res.ok) {
          const json = (await res.json()) as {
            categories?: ReconCategory[];
            highRiskCount?: number;
            defaultSelectedCategoryNos?: number[];
            warnings?: string[];
          };
          const list = Array.isArray(json.categories) ? json.categories : [];
          setCategories(list);
          setHighRiskCount(typeof json.highRiskCount === "number" ? json.highRiskCount : 0);
          setReconWarnings(Array.isArray(json.warnings) ? (json.warnings.filter((w) => typeof w === "string") as string[]) : []);

          const defaults = Array.isArray(json.defaultSelectedCategoryNos)
            ? (json.defaultSelectedCategoryNos.filter((n) => typeof n === "number") as number[])
            : [];
          setSelectedCategoryNos(defaults.length ? defaults : list.slice(0, 1).map((c) => c.categoryNo));

          // Always let user confirm via modal (requested UX).
          setPhase("choose_category");
          return;
        }

        // Ownership/session errors should stop immediately and guide user back to home.
        if (res.status === 403 || res.status === 401 || res.status === 500) {
          const msg = await readApiErrorMessage(res);
          throw new Error(msg ?? `API error: ${res.status}`);
        }

        // Otherwise, attempt analysis (API will auto-pick / fallback).
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
      <h1 className="sr-only">블로그 게시글 OSINT 분석 워크벤치</h1>
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
          <div className="w-full max-w-xl">
            <CyberLoader status={"카테고리 목록을 준비 중…"} />
            <Modal
              open={true}
              title="분석할 카테고리 확인"
              onClose={() => {
                // Keep flow consistent: allow user to back out to home.
                router.push("/");
              }}
            >
              <div className="text-sm text-zinc-200">
                해커가 주목할 만한 카테고리{" "}
                <span className="font-mono text-white">{highRiskCount}</span>개를
                발견했습니다. 이 카테고리들을 분석할까요?
              </div>
              <div className="mt-2 text-xs text-zinc-400">
                체크박스로 분석 범위를 최종 선택할 수 있어요. (블챌 카테고리는 High
                Risk로 상단에 고정됩니다)
              </div>

              {reconWarnings.length ? (
                <div className="mt-4 rounded-xl border border-white/15 bg-black/30 p-3 text-xs text-zinc-200">
                  <div className="font-semibold text-white">알림</div>
                  <ul className="mt-2 space-y-1">
                    {reconWarnings.slice(0, 4).map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const only = categories
                      .filter((c) => c.risk === "high" || c.isChallenge)
                      .map((c) => c.categoryNo);
                    setSelectedCategoryNos(Array.from(new Set(only)));
                  }}
                >
                  위험만 선택
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedCategoryNos([])}
                >
                  전체 해제
                </Button>
                <div className="ml-auto text-xs text-zinc-400">
                  선택{" "}
                  <span className="font-mono text-zinc-100">
                    {selectedCategoryNos.length}
                  </span>
                  개
                </div>
              </div>

              <div className="mt-4 max-h-[52vh] overflow-auto rounded-xl border border-white/10 bg-black/20">
                <ul className="divide-y divide-white/10">
                  {categories.map((c) => {
                    const checked = selectedCategoryNos.includes(c.categoryNo);
                    const disabled = c.openYN === false;
                    return (
                      <li
                        key={c.categoryNo}
                        className={[
                          "flex items-start gap-3 px-4 py-3",
                          disabled ? "opacity-60" : "hover:bg-white/5",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[rgba(255,255,255,0.78)]"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSelectedCategoryNos((prev) => {
                              const next = new Set(prev);
                              if (on) next.add(c.categoryNo);
                              else next.delete(c.categoryNo);
                              return Array.from(next);
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold text-white">
                                  {c.categoryName}
                                </div>
                                {c.isChallenge ? <Tag tone="accent">BLCH</Tag> : null}
                                {c.risk === "high" ? <Tag tone="danger">High Risk</Tag> : null}
                                {disabled ? (
                                  <Tag tone="warn">접근 제한</Tag>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">
                                <span className="font-mono text-zinc-200">#{c.categoryNo}</span>
                                {" / "}게시물{" "}
                                <span className="font-mono text-zinc-200">
                                  {c.postCnt}
                                </span>
                                {c.risk === "high" && c.riskReason ? (
                                  <>
                                    {" / "}
                                    <span className="text-zinc-300">
                                      {c.riskReason}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              {disabled ? (
                                <div className="mt-1 text-xs text-zinc-500">
                                  비공개/접근 제한 가능성이 있어 분석 대상에서 제외됩니다.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      if (!selectedCategoryNos.length) {
                        setError("분석할 카테고리를 1개 이상 선택해 주세요.");
                        return;
                      }
                      await runAnalyze(selectedCategoryNos);
                    } catch (e) {
                      setPhase("error");
                      setError(
                        e instanceof Error
                          ? `분석을 완료하지 못했어요: ${e.message}`
                          : "분석을 완료하지 못했어요.",
                      );
                    }
                  }}
                  disabled={!selectedCategoryNos.length}
                >
                  선택한 카테고리로 분석 시작
                </Button>
                <Button onClick={() => router.push("/")}>홈으로</Button>
              </div>

              {error ? (
                <div className="mt-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/90">
                  {error}
                </div>
              ) : null}
            </Modal>
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
