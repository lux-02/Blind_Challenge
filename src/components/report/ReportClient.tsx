"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import ReportHeader from "@/components/report/ReportHeader";
import ReportTabs, { type ReportTab } from "@/components/report/ReportTabs";
import GraphPanel from "@/components/report/GraphPanel";
import { useVisionProgressive } from "@/components/report/useVisionProgressive";
import { useAttackGraphLLM } from "@/components/report/useAttackGraphLLM";
import { usePhishingSimulation } from "@/components/report/usePhishingSimulation";
import { usePostInsightsLLM } from "@/components/report/usePostInsightsLLM";
import type { BlindReport } from "@/lib/types";
import { buildMockReport } from "@/lib/mockReport";
import { buildPostRecommendations } from "@/lib/recommendations";
import { notifyStorageChanged, subscribeStorageChanged } from "@/lib/storageBus";
import Button from "@/components/ui/Button";
import Tag from "@/components/ui/Tag";

const STORAGE_KEY = "blindchallenge:latestReport";

const PIECE_TYPE_WEIGHT: Record<string, number> = {
  address_hint: 5,
  photo_metadata: 5,
  family: 4,
  schedule: 3,
  other: 1,
};

function scorePiece(p: NonNullable<BlindReport["extractedPieces"]>[number]) {
  const base = PIECE_TYPE_WEIGHT[p.type] ?? 1;
  const conf =
    typeof p.evidence?.confidence === "number"
      ? Math.max(0, Math.min(1, p.evidence.confidence))
      : 0.6;
  return base * (0.65 + conf * 0.7);
}

function safeNumber(n: unknown, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export default function ReportClient({ blogId }: { blogId: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  const demo = sp.get("demo") === "1";

  function formatUTC(isoLike: string) {
    const d = new Date(isoLike);
    if (!Number.isFinite(d.getTime())) return isoLike;
    return d.toISOString().replace("T", " ").replace(".000Z", "Z");
  }

  const tab = useMemo<ReportTab>(() => {
    const t = sp.get("tab");
    if (t === "graph" || t === "evidence" || t === "training" || t === "overview") {
      return t;
    }
    return "overview";
  }, [sp]);

  const setTab = (next: ReportTab) => {
    const p = new URLSearchParams(sp.toString());
    p.set("tab", next);
    router.replace(`/report?${p.toString()}`, { scroll: false });
  };

  const allowReadRef = useRef(false);
  useEffect(() => {
    allowReadRef.current = true;
    notifyStorageChanged("session", STORAGE_KEY);
  }, []);

  const reportRaw = useSyncExternalStore(
    subscribeStorageChanged,
    () => {
      if (!allowReadRef.current) return null;
      try {
        return sessionStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const storedReport = useMemo(() => {
    if (!reportRaw) return null;
    try {
      return JSON.parse(reportRaw) as BlindReport;
    } catch {
      return null;
    }
  }, [reportRaw]);

  const report = useMemo<BlindReport>(() => {
    if (demo) return buildMockReport("sample");
    if (storedReport?.blogId && storedReport.blogId === blogId) return storedReport;
    return buildMockReport(blogId);
  }, [blogId, demo, storedReport]);

  const setReport = useCallback<
    React.Dispatch<React.SetStateAction<BlindReport | null>>
  >(
    (nextAction) => {
      if (demo) return;
      if (typeof window === "undefined") return;

      let prev: BlindReport | null = null;
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) prev = JSON.parse(raw) as BlindReport;
      } catch {
        // ignore
      }

      const next =
        typeof nextAction === "function"
          ? (nextAction as (p: BlindReport | null) => BlindReport | null)(prev)
          : nextAction;

      try {
        if (next == null) sessionStorage.removeItem(STORAGE_KEY);
        else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        notifyStorageChanged("session", STORAGE_KEY);
      } catch {
        // ignore
      }
    },
    [demo],
  );
  const highlightTimerRef = useRef<number | null>(null);
  const [highlightLogNo, setHighlightLogNo] = useState<string | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<{
    logNo: string;
    pieceType: string;
    pieceValue: string;
    excerpt: string;
    rationale: string;
    confidence?: number;
  } | null>(null);
  const [activeImageFinding, setActiveImageFinding] = useState<{
    logNo: string;
    imageUrl: string;
    label: string;
    severity: "low" | "medium" | "high";
    excerpt: string;
    rationale: string;
    confidence?: number;
  } | null>(null);
  const [activePostLogNo, setActivePostLogNo] = useState<string | null>(null);
  const [pendingFocusLogNo, setPendingFocusLogNo] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [fullContentByLogNo, setFullContentByLogNo] = useState<Record<string, boolean>>({});

  const [pieceTypeFilter, setPieceTypeFilter] = useState<
    "all" | BlindReport["extractedPieces"][number]["type"]
  >("all");
  const [pieceEvidenceOnly, setPieceEvidenceOnly] = useState(false);
  const [minConfidence, setMinConfidence] = useState<"all" | "50" | "70">("all");
  const [postQuery, setPostQuery] = useState("");

  const vision = useVisionProgressive({ report, setReport, disabled: demo });
  const graphLLM = useAttackGraphLLM({ report, setReport, disabled: demo });
  const phishing = usePhishingSimulation({ report, setReport, disabled: demo });
  const postInsightsLLM = usePostInsightsLLM({ report, setReport, disabled: demo });

  const postInsightByLogNo = useMemo(() => {
    const m = new Map<string, NonNullable<BlindReport["postInsights"]>["posts"][number]>();
    for (const p of report?.postInsights?.posts ?? []) m.set(p.logNo, p);
    return m;
  }, [report?.postInsights?.posts]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!actionToast) return;
    const t = window.setTimeout(() => setActionToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [actionToast]);

  const contentsByUrl = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of report?.contents ?? []) {
      m.set(c.url, c.logNo);
    }
    return m;
  }, [report?.contents]);

  const piecesByLogNo = useMemo(() => {
    const m = new Map<string, NonNullable<BlindReport["extractedPieces"]>>();
    for (const p of report?.extractedPieces ?? []) {
      const logNo =
        p.evidence?.logNo ??
        (p.evidence?.postUrl ? contentsByUrl.get(p.evidence.postUrl) : undefined);
      if (!logNo) continue;
      const list = m.get(logNo) ?? [];
      list.push(p);
      m.set(logNo, list);
    }
    return m;
  }, [contentsByUrl, report?.extractedPieces]);

  const imageFindingsByLogNo = useMemo(() => {
    const m = new Map<string, NonNullable<BlindReport["imageFindings"]>>();
    for (const f of report?.imageFindings ?? []) {
      const list = m.get(f.postLogNo) ?? [];
      list.push(f);
      m.set(f.postLogNo, list);
    }
    return m;
  }, [report?.imageFindings]);

  const postRiskByLogNo = useMemo(() => {
    const m = new Map<string, { score: number; pieceCount: number }>();
    for (const [logNo, pieces] of piecesByLogNo.entries()) {
      const rawScore = pieces.reduce((acc, p) => acc + scorePiece(p), 0);
      const score = Math.round(rawScore * 10) / 10;
      m.set(logNo, { score, pieceCount: pieces.length });
    }
    return m;
  }, [piecesByLogNo]);

  const scoringByLogNo = useMemo(() => {
    const m = new Map<
      string,
      { score: number; pieceCount: number; imageCount: number; reasons: string[] }
    >();

    const postScores = report?.scoring?.postScores ?? [];
    for (const p of postScores) {
      m.set(p.logNo, {
        score: p.score,
        pieceCount: p.pieceIndexes.length,
        imageCount: p.imageFindingIndexes.length,
        reasons: p.reasons,
      });
    }

    if (m.size) return m;

    for (const [logNo, v] of postRiskByLogNo.entries()) {
      m.set(logNo, {
        score: v.score,
        pieceCount: v.pieceCount,
        imageCount: imageFindingsByLogNo.get(logNo)?.length ?? 0,
        reasons: [],
      });
    }
    return m;
  }, [imageFindingsByLogNo, postRiskByLogNo, report?.scoring?.postScores]);

  const topRiskPosts = useMemo(() => {
    const items = (report?.contents ?? []).map((c) => {
      const pieces = piecesByLogNo.get(c.logNo) ?? [];
      const score = postRiskByLogNo.get(c.logNo)?.score ?? 0;
      const topPiece =
        pieces
          .slice()
          .sort((a, b) => scorePiece(b) - scorePiece(a))[0] ?? null;
      return {
        logNo: c.logNo,
        title: c.title,
        url: c.url,
        publishedAt: c.publishedAt,
        pieceCount: pieces.length,
        score,
        topPiece,
      };
    });

    return items
      .filter((x) => x.pieceCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [piecesByLogNo, postRiskByLogNo, report?.contents]);

  const topRiskPostsResolved = useMemo(() => {
    const scored = report?.scoring?.postScores?.slice(0, 5);
    if (scored?.length) {
      return scored.map((p) => ({
        logNo: p.logNo,
        title: p.title,
        url: p.url,
        publishedAt: p.publishedAt,
        pieceCount: p.pieceIndexes.length,
        imageCount: p.imageFindingIndexes.length,
        score: p.score,
        topPiece:
          report?.extractedPieces?.[p.pieceIndexes[0] ?? -1] ?? null,
      }));
    }

    return topRiskPosts.map((p) => ({
      ...p,
      imageCount: imageFindingsByLogNo.get(p.logNo)?.length ?? 0,
    }));
  }, [
    imageFindingsByLogNo,
    report?.extractedPieces,
    report?.scoring?.postScores,
    topRiskPosts,
  ]);

  const postRecommendationsByLogNo = useMemo(() => {
    const m = new Map<string, string[]>();
    const contents = report?.contents ?? [];
    for (const c of contents) {
      const pieces = piecesByLogNo.get(c.logNo) ?? [];
      const imageFindings = imageFindingsByLogNo.get(c.logNo) ?? [];
      const recs = buildPostRecommendations({
        pieces,
        imageFindings,
        visionStatus: report?.vision?.status,
      });
      if (recs.length) m.set(c.logNo, recs);
    }
    return m;
  }, [imageFindingsByLogNo, piecesByLogNo, report?.contents, report?.vision?.status]);

  const reportImpact = useMemo(() => {
    const postScores = report?.scoring?.postScores ?? [];
    const totalPosts = report?.contents?.length ?? 0;
    const riskyPosts = postScores.length;
    const totalPieces = report?.extractedPieces?.length ?? 0;
    const totalImageFindings = report?.imageFindings?.length ?? 0;
    const totalImages = (report?.contents ?? []).reduce(
      (acc, c) => acc + (c.images?.length ?? 0),
      0,
    );

    const sumAll = postScores.reduce((acc, p) => acc + safeNumber(p.score, 0), 0);
    const sumTop3 = postScores
      .slice(0, 3)
      .reduce((acc, p) => acc + safeNumber(p.score, 0), 0);
    const top3Share = sumAll > 0 ? Math.round((sumTop3 / sumAll) * 100) : 0;

    const highImg = (report?.imageFindings ?? []).filter((f) => f.severity === "high")
      .length;
    const medImg = (report?.imageFindings ?? []).filter((f) => f.severity === "medium")
      .length;

    return {
      totalPosts,
      riskyPosts,
      totalPieces,
      totalImageFindings,
      totalImages,
      top3Share,
      highImg,
      medImg,
    };
  }, [report?.contents, report?.extractedPieces, report?.imageFindings, report?.scoring?.postScores]);

  const filteredPieces = useMemo(() => {
    const list = report?.extractedPieces ?? [];
    const min =
      minConfidence === "70" ? 0.7 : minConfidence === "50" ? 0.5 : null;
    return list.filter((p) => {
      if (pieceTypeFilter !== "all" && p.type !== pieceTypeFilter) return false;
      if (pieceEvidenceOnly && !p.evidence) return false;
      if (min != null) {
        const c = typeof p.evidence?.confidence === "number" ? p.evidence.confidence : 0.6;
        if (c < min) return false;
      }
      return true;
    });
  }, [minConfidence, pieceEvidenceOnly, pieceTypeFilter, report?.extractedPieces]);

  const filteredContents = useMemo(() => {
    const list = report?.contents ?? [];
    const q = postQuery.trim().toLowerCase();
    const base = list.filter((c) => {
      const t = `${c.title}\n${c.text}`.toLowerCase();
      return !q || t.includes(q);
    });
    if (!pieceEvidenceOnly) return base;
    // Evidence-only mode: show only posts that actually have evidence/signals.
    return base.filter((c) => {
      const v = scoringByLogNo.get(c.logNo);
      const pieceCount = v?.pieceCount ?? 0;
      const imageCount = v?.imageCount ?? 0;
      return pieceCount + imageCount > 0;
    });
  }, [pieceEvidenceOnly, postQuery, report?.contents, scoringByLogNo]);

  const actionChecklistText = useMemo(() => {
    const lines = [
      "1) Top 위험 글부터 공개 범위를 이웃공개/비공개로 낮추기",
      "2) 지명/시간/관계 단서 문장 흐리기(구체 표현 삭제)",
      "3) 사진의 라벨/명찰/서류/송장 모자이크 후 재업로드(또는 삭제)",
    ];
    return lines.join("\n");
  }, []);

  const focusContent = useCallback((logNo: string) => {
    const el = document.getElementById(`content-${logNo}`) as HTMLDetailsElement | null;
    if (!el) return;

    // Open details so the user immediately sees the extracted text.
    el.open = true;

    el.scrollIntoView({ behavior: "smooth", block: "start" });

    setHighlightLogNo(logNo);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightLogNo(null);
    }, 3500);
  }, []);

  useEffect(() => {
    if (tab !== "evidence") return;
    if (!pendingFocusLogNo) return;
    const logNo = pendingFocusLogNo;
    const t = window.setTimeout(() => {
      focusContent(logNo);
      setPendingFocusLogNo(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [focusContent, pendingFocusLogNo, tab]);

  function onPieceClick(p: NonNullable<BlindReport["extractedPieces"]>[number]) {
    if (!p.evidence) return;
    const logNo =
      p.evidence.logNo ??
      (p.evidence.postUrl ? contentsByUrl.get(p.evidence.postUrl) : undefined);
    if (!logNo) return;

    setActiveEvidence({
      logNo,
      pieceType: p.type,
      pieceValue: p.value,
      excerpt: p.evidence.excerpt,
      rationale: p.evidence.rationale,
      confidence: p.evidence.confidence,
    });
    setActiveImageFinding(null);
    setActivePostLogNo(logNo);
    setPendingFocusLogNo(logNo);
  }

  function onSelectPieceIndex(pieceIndex: number) {
    const p = report?.extractedPieces?.[pieceIndex];
    if (!p) return;
    onPieceClick(p);
  }

  function onSelectImageFindingIndex(findingIndex: number) {
    const f = report?.imageFindings?.[findingIndex];
    if (!f) return;
    onImageFindingClick(f);
  }

  function onImageFindingClick(
    f: NonNullable<BlindReport["imageFindings"]>[number],
  ) {
    setActiveEvidence(null);
    setActiveImageFinding({
      logNo: f.postLogNo,
      imageUrl: f.imageUrl,
      label: f.label,
      severity: f.severity,
      excerpt: f.excerpt,
      rationale: f.rationale,
      confidence: f.confidence,
    });
    setActivePostLogNo(f.postLogNo);
    setPendingFocusLogNo(f.postLogNo);
  }

  function onTopPostClick(logNo: string) {
    setActivePostLogNo(logNo);
    const pieces = piecesByLogNo.get(logNo) ?? [];
    // Prefer a piece that actually has evidence so we can show excerpt/rationale.
    const best =
      pieces.find((p) => p.evidence?.excerpt && p.evidence?.rationale) ??
      pieces[0] ??
      null;
    if (best?.evidence) {
      setActiveEvidence({
        logNo,
        pieceType: best.type,
        pieceValue: best.value,
        excerpt: best.evidence.excerpt,
        rationale: best.evidence.rationale,
        confidence: best.evidence.confidence,
      });
    } else {
      setActiveEvidence(null);
    }
    setActiveImageFinding(null);
    setPendingFocusLogNo(logNo);
  }

  if (!blogId) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10 sm:px-10">
        <h1 className="text-xl font-semibold text-white">
          리포트를 열 수 없어요
        </h1>
        <p className="mt-3 text-sm text-zinc-300">
          blogId가 비어 있어요. 홈으로 돌아가서 다시 입력해 주세요.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.push("/")}>홈으로</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 pb-16 sm:px-10">
      <ReportHeader
        blogId={blogId}
        demo={demo}
        category={report?.category ?? null}
        categories={report?.categories ?? null}
        riskScore={typeof report?.riskScore === "number" ? report.riskScore : null}
        generatedAt={report?.generatedAt ?? null}
      />

      <div className="mt-6">
        <ReportTabs tab={tab} onChange={setTab} />
      </div>

      {!report ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300 backdrop-blur-sm">
          리포트를 불러오는 중…
        </div>
      ) : (
        <>
          {tab === "overview" ? (
            <>
              {report.warnings?.length ? (
                <section className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm">
                  <h3 className="text-sm font-semibold text-white">알림</h3>
                  <ul className="mt-3 space-y-2 text-sm text-white/85">
                    {report.warnings.map((w) => (
                      <li key={w} className="leading-6">
                        {w}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="text-xs text-zinc-400">수집 게시물</div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-white">
                    {reportImpact.totalPosts}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">posts</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="text-xs text-zinc-400">위험 신호 포함</div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-white">
                    {reportImpact.riskyPosts}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">posts</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="text-xs text-zinc-400">텍스트/이미지 단서</div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-white">
                    {reportImpact.totalPieces}/{reportImpact.totalImageFindings}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">signals</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="text-xs text-zinc-400">상위 3개 집중도</div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-white">
                    {reportImpact.top3Share}%
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-[linear-gradient(90deg,rgba(255,255,255,0.28),rgba(255,255,255,0.92))]"
                      style={{ width: `${Math.max(0, Math.min(100, reportImpact.top3Share))}%` }}
                    />
                  </div>
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">바로 써먹는 조치</h2>
                    <p className="mt-1 text-sm text-zinc-300">
                      Top 위험 글 1~3개만 수정해도 체감 위험도가 크게 내려갑니다.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(actionChecklistText);
                        setActionToast("조치 체크리스트를 복사했어요.");
                      } catch {
                        setActionToast("복사에 실패했어요.");
                      }
                    }}
                  >
                    조치 복사
                  </Button>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-zinc-200">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <span className="font-mono text-xs text-zinc-400">1</span>{" "}
                    Top 위험 글부터 <span className="font-semibold text-white">이웃공개/비공개</span>로 전환
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <span className="font-mono text-xs text-zinc-400">2</span>{" "}
                    지명/시간/관계 단서 문장 흐리기(구체 표현 삭제)
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <span className="font-mono text-xs text-zinc-400">3</span>{" "}
                    사진 라벨/명찰/서류는 모자이크 후 재업로드(또는 삭제)
                  </div>
                </div>
              </section>

              {!demo && vision.progress.total && report.vision?.status !== "complete" ? (
                <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        이미지 단서 분석(점진 처리)
                      </h2>
                      <p className="mt-1 text-sm text-zinc-300">
                        429(TPM) 방지를 위해 여러 번에 걸쳐 이미지를 분석합니다.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {vision.paused ? (
                        <Button variant="primary" size="sm" onClick={vision.resume}>
                          재개
                        </Button>
                      ) : (
                        <>
                          {vision.state.kind === "error" ? (
                            <Button variant="primary" size="sm" onClick={vision.resume}>
                              다시 시도
                            </Button>
                          ) : null}
                          <Button size="sm" onClick={vision.pause}>
                            일시정지
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <div>
                        진행:{" "}
                        <span className="font-mono text-zinc-200">
                          {vision.progress.processed}/{vision.progress.total}
                        </span>
                      </div>
                      <div className="font-mono">
                        {vision.state.kind === "rate_limited"
                          ? `rate limited (${Math.ceil(vision.state.retryAfterMs / 1000)}s)`
                          : vision.state.kind}
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-[linear-gradient(90deg,rgba(255,255,255,0.20),rgba(255,255,255,0.92),rgba(255,255,255,0.35))] transition-[width] duration-200"
                        style={{
                          width: `${
                            vision.progress.total
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (vision.progress.processed / vision.progress.total) * 100,
                                  ),
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    {vision.state.kind === "error" ? (
                      <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-white/90">
                        Vision 분석 중 오류:{" "}
                        <span className="font-mono">{vision.state.message}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {topRiskPostsResolved.length ? (
                <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-white">Top 위험 게시물</h2>
                      <p className="mt-1 text-sm text-zinc-300">
                        클릭하면 Evidence 탭에서 근거 포스트로 바로 이동합니다.
                      </p>
                    </div>
                    <div className="text-xs text-zinc-400">
                      score는 단서 타입/개수/confidence 기반
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {topRiskPostsResolved.map((p) => (
                      <button
                        key={p.logNo}
                        onClick={() => {
                          onTopPostClick(p.logNo);
                          setTab("evidence");
                        }}
                        className={[
                          "bc-focus text-left rounded-xl border p-4 transition",
                          activePostLogNo === p.logNo
                            ? "border-white/35 bg-[rgba(255,255,255,0.06)]"
                            : "border-white/10 bg-black/20 hover:border-white/20",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {p.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                              <span className="font-mono">{p.publishedAt ?? "-"}</span>
                              <span className="font-mono">logNo: {p.logNo}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] text-zinc-400">score</div>
                            <div className="font-mono text-sm font-semibold text-white">
                              {p.score}
                            </div>
                            <div className="mt-0.5 text-[10px] text-zinc-400">
                              텍스트 {p.pieceCount} / 이미지 {p.imageCount ?? 0}
                            </div>
                          </div>
                        </div>
                        {postRecommendationsByLogNo.get(p.logNo)?.length ? (
                          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2">
                            <div className="text-[10px] text-zinc-400">권장 조치</div>
                            <ul className="mt-1 space-y-1 text-xs text-zinc-200">
                              {postRecommendationsByLogNo.get(p.logNo)!.map((a) => (
                                <li key={a} className="leading-5">
                                  • {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-300 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-white">대응 가이드 (즉시 적용)</h3>
                <p className="mt-2 text-sm text-zinc-300">
                  공포가 아니라, 지금 당장 바꿀 수 있는 행동을 제안합니다.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs font-semibold text-white">공개 범위</div>
                    <div className="mt-2 text-sm text-zinc-200">
                      Top 위험 글부터 <span className="font-semibold text-white">이웃공개/비공개</span>로 전환
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      “전체 공개”는 OSINT 수집 비용을 크게 낮춥니다.
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs font-semibold text-white">문장 수정</div>
                    <div className="mt-2 text-sm text-zinc-200">
                      지명/시간/관계 단서를 <span className="font-semibold text-white">덜 구체적으로</span> 바꾸기
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      예: “내일 OO역” → “최근 외출”.
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs font-semibold text-white">사진 모자이크</div>
                    <div className="mt-2 text-sm text-zinc-200">
                      송장/명찰/서류는 <span className="font-semibold text-white">가리고</span> 업로드
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      특히 “중/고” 이미지 단서가 있으면 최우선.
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {tab === "graph" ? (
            <>
              {!demo ? (
                <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        그래프 정밀 분석(LLM)
                      </h2>
                      <p className="mt-1 text-sm text-zinc-300">
                        단서와 위험/시나리오의 연결 근거를 AI가 재구성합니다.
                      </p>
                    </div>
                    {graphLLM.state.kind === "error" ? (
                      <Button variant="primary" size="sm" onClick={graphLLM.retry}>
                        다시 시도
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <div>상태</div>
                      <div className="font-mono">
                        {graphLLM.state.kind === "rate_limited"
                          ? `rate limited (${Math.ceil(graphLLM.state.retryAfterMs / 1000)}s)`
                          : graphLLM.state.kind}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-200">
                      {report.attackGraph?.edges?.length
                        ? `LLM 그래프 적용됨: edge ${report.attackGraph.edges.length}개`
                        : "아직 LLM 그래프가 없어요(휴리스틱 그래프 사용 중)."}
                    </div>
                    {report.attackGraph?.generatedAt ? (
                      <div className="mt-2 text-xs text-zinc-400">
                        생성:{" "}
                        <span className="font-mono text-zinc-200">
                          {formatUTC(report.attackGraph.generatedAt)}
                        </span>
                        {" / "}model:{" "}
                        <span className="font-mono text-zinc-200">
                          {report.attackGraph.model}
                        </span>
                      </div>
                    ) : null}
                    {graphLLM.state.kind === "error" ? (
                      <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-white/90">
                        오류: <span className="font-mono">{graphLLM.state.message}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : (
                <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-white">Graph</h2>
                      <p className="mt-1 text-sm text-zinc-300">
                        샘플 모드에서는 휴리스틱 그래프를 표시합니다.
                      </p>
                    </div>
                    <Tag tone="warn">demo</Tag>
                  </div>
                </section>
              )}

              <section className="mt-6">
                <GraphPanel
                  report={report}
                  onSelectPiece={(idx) => {
                    onSelectPieceIndex(idx);
                    setTab("evidence");
                  }}
                  onSelectImageFinding={(idx) => {
                    onSelectImageFindingIndex(idx);
                    setTab("evidence");
                  }}
                />
              </section>
            </>
          ) : null}

          {tab === "evidence" ? (
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Evidence</h3>
                  <p className="mt-1 text-sm text-zinc-300">
                    탐지된 단서와 해당 포스트(텍스트/이미지)를 한 곳에서 확인할 수 있어요.
                  </p>
                  {!demo ? (
                    <div className="mt-2 text-xs text-zinc-400">
                      포스트 통합 분석:{" "}
                      <span className="font-mono text-zinc-200">
                        {postInsightsLLM.state.kind === "rate_limited"
                          ? `rate limited (${Math.ceil(postInsightsLLM.state.retryAfterMs / 1000)}s)`
                          : postInsightsLLM.state.kind}
                      </span>
                      {report.postInsights?.model ? (
                        <>
                          {" / "}model:{" "}
                          <span className="font-mono text-zinc-200">
                            {report.postInsights.model}
                          </span>
                        </>
                      ) : null}
                      {postInsightsLLM.state.kind === "error" ? (
                        <>
                          {" "}
                          <Button size="sm" variant="ghost" onClick={postInsightsLLM.retry}>
                            재시도
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-zinc-400">
                  포스트 {filteredContents.length}개 / 단서 {filteredPieces.length}개
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200 lg:grid-cols-4">
                <div className="lg:col-span-1">
                  <div className="text-xs text-zinc-400">단서 타입</div>
                  <select
                    className="bc-focus mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    value={pieceTypeFilter}
                    onChange={(e) => setPieceTypeFilter(e.target.value as typeof pieceTypeFilter)}
                  >
                    <option value="all">전체</option>
                    <option value="address_hint">address_hint</option>
                    <option value="schedule">schedule</option>
                    <option value="family">family</option>
                    <option value="photo_metadata">photo_metadata</option>
                    <option value="other">other</option>
                  </select>
                </div>
                <div className="lg:col-span-1">
                  <div className="text-xs text-zinc-400">confidence</div>
                  <select
                    className="bc-focus mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    value={minConfidence}
                    onChange={(e) => setMinConfidence(e.target.value as typeof minConfidence)}
                  >
                    <option value="all">전체</option>
                    <option value="50">50% 이상</option>
                    <option value="70">70% 이상</option>
                  </select>
                </div>
                <div className="lg:col-span-1">
                  <div className="text-xs text-zinc-400">옵션</div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pieceEvidenceOnly}
                      onChange={(e) => setPieceEvidenceOnly(e.target.checked)}
                    />
                    근거(evidence) 있는 것만
                  </label>
                </div>
                <div className="lg:col-span-1">
                  <div className="text-xs text-zinc-400">포스트 검색</div>
                  <input
                    className="bc-focus mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                    value={postQuery}
                    onChange={(e) => setPostQuery(e.target.value)}
                    placeholder="제목/본문에서 검색"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">
                        탐지된 정보 조각
                      </div>
                      <div className="text-xs text-zinc-400">{filteredPieces.length}</div>
                    </div>
                    <div className="mt-3 max-h-[620px] space-y-2 overflow-auto pr-1">
                      {filteredPieces.length ? (
                        filteredPieces.slice(0, 50).map((p, idx) => (
                          <button
                            key={`${p.type}-${idx}-${p.value}`}
                            className={[
                              "bc-focus w-full text-left rounded-xl border px-3 py-3 transition",
                              p.evidence
                                ? "border-white/10 bg-black/30 hover:border-white/20"
                                : "border-white/5 bg-black/20 opacity-70 cursor-default",
                            ].join(" ")}
                            disabled={!p.evidence}
                            onClick={() => onPieceClick(p)}
                            title={
                              p.evidence
                                ? "클릭하면 근거 포스트로 이동합니다."
                                : "근거가 없어 이동할 수 없습니다."
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-white">{p.type}</div>
                              <div className="font-mono text-xs text-zinc-400">
                                {p.evidencePostDate}
                              </div>
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">{p.value}</div>
                            {typeof p.evidence?.confidence === "number" ? (
                              <div className="mt-2 text-[11px] text-zinc-400">
                                confidence:{" "}
                                <span className="font-mono text-zinc-200">
                                  {Math.round(p.evidence.confidence * 100)}%
                                </span>
                              </div>
                            ) : null}
                            {p.evidence?.excerpt ? (
                              <div className="mt-2 line-clamp-2 rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-xs leading-5 text-zinc-300">
                                {p.evidence.excerpt}
                              </div>
                            ) : null}
                          </button>
                        ))
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                          조건에 맞는 단서가 없어요.
                        </div>
                      )}
                    </div>
                    {filteredPieces.length > 50 ? (
                      <div className="mt-3 text-xs text-zinc-500">
                        + {filteredPieces.length - 50}개 더 있음 (표시는 50개로 제한)
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">카테고리 콘텐츠</div>
                      <div className="text-xs text-zinc-400">{filteredContents.length}</div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {filteredContents.length ? (
                        filteredContents.map((c) => (
                          <details
                            key={c.logNo}
                            id={`content-${c.logNo}`}
                            className={[
                              "bc-cv-auto group rounded-xl border bg-black/30 p-4 transition",
                              highlightLogNo === c.logNo
                                ? "border-white/35 ring-2 ring-[rgba(255,255,255,0.16)]"
                                : "border-white/10",
                            ].join(" ")}
                          >
                            <summary className="cursor-pointer list-none">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white">
                                    {c.title}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                                    <span className="font-mono">{c.publishedAt ?? "-"}</span>
                                    <span className="font-mono">logNo: {c.logNo}</span>
                                    <span>이미지: {c.images?.length ?? 0}</span>
                                    <span>단서: {scoringByLogNo.get(c.logNo)?.pieceCount ?? 0}</span>
                                    <span>이미지 단서: {scoringByLogNo.get(c.logNo)?.imageCount ?? 0}</span>
                                    {scoringByLogNo.get(c.logNo)?.pieceCount ||
                                    scoringByLogNo.get(c.logNo)?.imageCount ? (
                                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-200">
                                        score {scoringByLogNo.get(c.logNo)?.score ?? "-"}
                                      </span>
                                    ) : null}
                                  </div>
                                  {postRecommendationsByLogNo.get(c.logNo)?.length ? (
                                    <div className="mt-2 line-clamp-1 text-xs text-zinc-300">
                                      <span className="text-zinc-500">권장 조치: </span>
                                      {postRecommendationsByLogNo.get(c.logNo)!.join(" · ")}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {pieceEvidenceOnly ? (
                                    <button
                                      type="button"
                                      className="bc-focus rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setFullContentByLogNo((prev) => ({
                                          ...prev,
                                          [c.logNo]: !prev[c.logNo],
                                        }));
                                      }}
                                      title="에비던스만 보기/전체 본문 보기 전환"
                                    >
                                      {fullContentByLogNo[c.logNo]
                                        ? "에비던스만"
                                        : "전체 텍스트 보기"}
                                    </button>
                                  ) : null}

                                  {!demo ? (
                                    <a
                                      className="bc-focus rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                                      href={c.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      원문 열기
                                    </a>
                                  ) : (
                                    <Tag tone="warn">demo</Tag>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-zinc-500">
                                <span className="group-open:hidden">열기</span>
                                <span className="hidden group-open:inline">접기</span>
                              </div>
                            </summary>

                            <div className="mt-4 space-y-3">
                              {postRecommendationsByLogNo.get(c.logNo)?.length ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs font-semibold text-white">
                                      권장 조치(바로 적용)
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                      {postRecommendationsByLogNo.get(c.logNo)!.length}개
                                    </div>
                                  </div>
                                  <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                                    {postRecommendationsByLogNo.get(c.logNo)!.map((a) => (
                                      <li key={a} className="leading-6">
                                        • {a}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {(() => {
                                const insight = postInsightByLogNo.get(c.logNo) ?? null;
                                if (insight) {
                                  return (
                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-white">
                                          AI 통합 분석(텍스트+이미지)
                                        </div>
                                        <div className="text-xs text-zinc-400">logNo: {c.logNo}</div>
                                      </div>
                                      {insight.riskSignals?.length ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {insight.riskSignals.slice(0, 6).map((s) => (
                                            <Tag key={s} tone="warn">
                                              {s}
                                            </Tag>
                                          ))}
                                        </div>
                                      ) : null}
                                      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                                        {insight.summary}
                                      </div>
                                      {insight.defensiveActions?.length ? (
                                        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                                          <div className="text-xs font-semibold text-white">
                                            권장 조치(요약)
                                          </div>
                                          <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                                            {insight.defensiveActions.slice(0, 5).map((a) => (
                                              <li key={a} className="leading-6">
                                                • {a}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                }

                                if (demo) return null;
                                if (postInsightsLLM.state.kind === "running") {
                                  return (
                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                                      AI 통합 분석 생성 중…
                                    </div>
                                  );
                                }
                                if (postInsightsLLM.state.kind === "error") {
                                  return (
                                    <div className="rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-white/90">
                                      AI 통합 분석 생성 오류:{" "}
                                      <span className="font-mono">{postInsightsLLM.state.message}</span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}

                              {activeEvidence?.logNo === c.logNo ? (
                                <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <div className="text-xs font-semibold text-white">
                                        선택된 정보 조각
                                      </div>
                                      <div className="mt-1 text-sm text-zinc-100">
                                        <span className="font-mono text-xs text-zinc-300">
                                          {activeEvidence.pieceType}
                                        </span>
                                        <span className="mx-2 text-zinc-400">|</span>
                                        {activeEvidence.pieceValue}
                                      </div>
                                    </div>
                                    {typeof activeEvidence.confidence === "number" ? (
                                      <div className="shrink-0 text-right">
                                        <div className="text-[10px] text-zinc-400">confidence</div>
                                        <div className="font-mono text-xs text-zinc-100">
                                          {Math.round(activeEvidence.confidence * 100)}%
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="mt-3">
                                    <div className="text-xs text-zinc-400">발췌</div>
                                    <div className="mt-1 rounded-md border border-white/10 bg-black/20 p-2 font-mono text-xs leading-5 text-zinc-100">
                                      {activeEvidence.excerpt}
                                    </div>
                                  </div>
                                  <div className="mt-3">
                                    <div className="text-xs text-zinc-400">AI 근거</div>
                                    <div className="mt-1 text-sm text-zinc-100">
                                      {activeEvidence.rationale}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {activeImageFinding?.logNo === c.logNo ? (
                                <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <div className="text-xs font-semibold text-white">
                                        선택된 이미지 단서
                                      </div>
                                      <div className="mt-1 text-sm text-zinc-100">
                                        <span
                                          className={[
                                            "rounded-full border px-2 py-0.5 font-mono text-[10px]",
                                            activeImageFinding.severity === "high"
                                              ? "border-white/50 bg-[rgba(255,255,255,0.08)] text-white"
                                              : activeImageFinding.severity === "medium"
                                                ? "border-white/40 bg-[rgba(255,255,255,0.06)] text-white/90"
                                                : "border-white/28 bg-[rgba(255,255,255,0.04)] text-white/85",
                                          ].join(" ")}
                                        >
                                          {activeImageFinding.severity}
                                        </span>
                                        <span className="mx-2 text-zinc-400">|</span>
                                        {activeImageFinding.label}
                                      </div>
                                    </div>
                                    {typeof activeImageFinding.confidence === "number" ? (
                                      <div className="shrink-0 text-right">
                                        <div className="text-[10px] text-zinc-400">confidence</div>
                                        <div className="font-mono text-xs text-zinc-100">
                                          {Math.round(activeImageFinding.confidence * 100)}%
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  {activeImageFinding.imageUrl ? (
                                    <div className="mt-3">
                                      <div className="text-xs text-zinc-400">해당 이미지</div>
                                      <a
                                        className="bc-focus mt-2 block overflow-hidden rounded-lg border border-white/10 bg-black/20 hover:border-white/20"
                                        href={activeImageFinding.imageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="클릭하면 원본 이미지를 새 탭에서 엽니다."
                                      >
                                        <div className="relative h-36 w-full">
                                          <Image
                                            src={activeImageFinding.imageUrl}
                                            alt="이미지 단서 미리보기"
                                            fill
                                            sizes="(max-width: 640px) 92vw, 640px"
                                            className="object-cover"
                                          />
                                        </div>
                                      </a>
                                    </div>
                                  ) : null}
                                  <div className="mt-3">
                                    <div className="text-xs text-zinc-400">요약</div>
                                    <div className="mt-1 rounded-md border border-white/10 bg-black/20 p-2 font-mono text-xs leading-5 text-zinc-100">
                                      {activeImageFinding.excerpt}
                                    </div>
                                  </div>
                                  <div className="mt-3">
                                    <div className="text-xs text-zinc-400">AI 근거</div>
                                    <div className="mt-1 text-sm text-zinc-100">
                                      {activeImageFinding.rationale}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {imageFindingsByLogNo.get(c.logNo)?.length ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs font-semibold text-white">이미지 단서</div>
                                    <div className="text-xs text-zinc-400">
                                      {imageFindingsByLogNo.get(c.logNo)?.length ?? 0}개
                                    </div>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    {imageFindingsByLogNo
                                      .get(c.logNo)!
                                      .slice(0, 8)
                                      .map((f, idx) => (
                                        <button
                                          key={`${f.imageUrl}-${idx}`}
                                          onClick={() => onImageFindingClick(f)}
                                          className="bc-focus w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left transition hover:border-white/20"
                                        >
                                          <div className="flex items-start gap-3">
                                            <a
                                              className={[
                                                "bc-focus relative mt-0.5 h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-black/20",
                                                activeImageFinding?.imageUrl === f.imageUrl
                                                  ? "border-white/35 ring-2 ring-[rgba(255,255,255,0.12)]"
                                                  : "border-white/10",
                                              ].join(" ")}
                                              href={f.imageUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              title="클릭하면 원본 이미지를 새 탭에서 엽니다."
                                            >
                                              <Image
                                                src={f.imageUrl}
                                                alt="이미지 단서 썸네일"
                                                fill
                                                sizes="56px"
                                                className="object-cover"
                                              />
                                            </a>

                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center justify-between gap-3">
                                                <div className="truncate text-xs font-semibold text-white">
                                                  {f.label}
                                                </div>
                                                <span
                                                  className={[
                                                    "rounded-full border px-2 py-0.5 font-mono text-[10px]",
                                                    f.severity === "high"
                                                      ? "border-white/50 bg-[rgba(255,255,255,0.08)] text-white"
                                                      : f.severity === "medium"
                                                        ? "border-white/40 bg-[rgba(255,255,255,0.06)] text-white/90"
                                                        : "border-white/28 bg-[rgba(255,255,255,0.04)] text-white/85",
                                                  ].join(" ")}
                                                >
                                                  {f.severity}
                                                </span>
                                              </div>
                                              <div className="mt-1 line-clamp-2 text-sm text-zinc-200">
                                                {f.excerpt}
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    {(imageFindingsByLogNo.get(c.logNo)?.length ?? 0) > 8 ? (
                                      <div className="text-xs text-zinc-500">
                                        + {imageFindingsByLogNo.get(c.logNo)!.length - 8}개 더 있음
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}

                              {piecesByLogNo.get(c.logNo)?.length ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs font-semibold text-white">
                                      이 포스트에서 탐지된 단서
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                      {piecesByLogNo.get(c.logNo)?.length ?? 0}개
                                    </div>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    {piecesByLogNo
                                      .get(c.logNo)!
                                      .slice(0, 8)
                                      .map((p, idx) => (
                                        <button
                                          key={`${p.type}-${idx}`}
                                          onClick={() => onPieceClick(p)}
                                          className="bc-focus w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left transition hover:border-white/20"
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="text-xs font-semibold text-white">
                                              {p.type}
                                            </div>
                                            <div className="font-mono text-xs text-zinc-400">
                                              {p.evidencePostDate}
                                            </div>
                                          </div>
                                          <div className="mt-1 text-sm text-zinc-200">
                                            {p.value}
                                          </div>
                                        </button>
                                      ))}
                                    {(piecesByLogNo.get(c.logNo)?.length ?? 0) > 8 ? (
                                      <div className="text-xs text-zinc-500">
                                        + {piecesByLogNo.get(c.logNo)!.length - 8}개 더 있음
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}

                              {pieceEvidenceOnly && !fullContentByLogNo[c.logNo] ? (
                                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <div className="text-xs font-semibold text-white">
                                    에비던스만 보기
                                  </div>
                                  <div className="mt-1 text-xs text-zinc-400">
                                    본문 텍스트/원본 이미지 목록은 숨기고, 근거 단서(발췌/이미지 단서)만 표시합니다.
                                  </div>
                                </div>
                              ) : null}

                              {pieceEvidenceOnly ? (
                                (piecesByLogNo.get(c.logNo) ?? []).some((p) => p.evidence?.excerpt) ? (
                                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-white">
                                        텍스트 에비던스(발췌)
                                      </div>
                                      <div className="text-xs text-zinc-400">
                                        {(piecesByLogNo.get(c.logNo) ?? []).filter((p) => Boolean(p.evidence?.excerpt)).length}개
                                      </div>
                                    </div>
                                    <div className="mt-2 space-y-2">
                                      {(piecesByLogNo.get(c.logNo) ?? [])
                                        .filter((p) => Boolean(p.evidence?.excerpt))
                                        .slice(0, 6)
                                        .map((p, idx) => (
                                          <div
                                            key={`${c.logNo}-ev-${idx}`}
                                            className="rounded-md border border-white/10 bg-black/30 p-2 font-mono text-xs leading-5 text-zinc-200"
                                          >
                                            {p.evidence!.excerpt}
                                          </div>
                                        ))}
                                      {(piecesByLogNo.get(c.logNo) ?? []).filter((p) => Boolean(p.evidence?.excerpt)).length > 6 ? (
                                        <div className="text-xs text-zinc-500">
                                          + {(piecesByLogNo.get(c.logNo) ?? []).filter((p) => Boolean(p.evidence?.excerpt)).length - 6}개 더 있음
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null
                              ) : null}

                              {!pieceEvidenceOnly || fullContentByLogNo[c.logNo] ? (
                                <div>
                                  <div className="text-xs text-zinc-400">추출 텍스트</div>
                                  <div className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs leading-5 text-zinc-200">
                                    {c.text || "(텍스트 없음)"}
                                  </div>
                                </div>
                              ) : null}

                              {!pieceEvidenceOnly || fullContentByLogNo[c.logNo] ? (
                                c.images?.length ? (
                                  <div>
                                    <div className="text-xs text-zinc-400">이미지 미리보기</div>
                                    <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                                      {c.images.slice(0, 12).map((u) => (
                                        <a
                                          key={u}
                                          href={u}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={[
                                            "bc-focus group relative overflow-hidden rounded-lg border bg-black/20",
                                            activeImageFinding?.imageUrl === u
                                              ? "border-white/35 ring-2 ring-[rgba(255,255,255,0.14)]"
                                              : "border-white/10",
                                          ].join(" ")}
                                          title="클릭하면 원본을 새 탭에서 엽니다."
                                        >
                                          <div className="relative h-20 w-full">
                                            <Image
                                              src={u}
                                              alt="추출 이미지"
                                              fill
                                              sizes="(max-width: 640px) 25vw, 12vw"
                                              className="object-cover transition group-hover:scale-[1.02]"
                                            />
                                          </div>
                                        </a>
                                      ))}
                                    </div>
                                    {c.images.length > 12 ? (
                                      <div className="mt-2 text-xs text-zinc-500">
                                        + {c.images.length - 12}개 더 있음
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null
                              ) : null}
                            </div>
                          </details>
                        ))
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                          아직 콘텐츠 목록이 없어요. (구버전 리포트이거나 수집 실패)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "training" ? (
            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      나를 노리는 가상 피싱 문자
                    </h3>
                    <p className="mt-1 text-sm text-zinc-300">
                      훈련용 시뮬레이션입니다(링크/번호/송금 유도 없음).
                    </p>
                  </div>
                  {!demo ? (
                    <Button size="sm" onClick={phishing.retry} title="최신 단서 기준으로 다시 생성합니다.">
                      재생성
                    </Button>
                  ) : (
                    <Tag tone="warn">demo</Tag>
                  )}
                </div>

                {!demo ? (
                  <div className="mt-2 text-xs text-zinc-400">
                    상태:{" "}
                    <span className="font-mono text-zinc-200">
                      {phishing.state.kind === "rate_limited"
                        ? `rate limited (${Math.ceil(phishing.state.retryAfterMs / 1000)}s)`
                        : phishing.state.kind}
                    </span>
                    {report.phishingSimulation?.model ? (
                      <>
                        {" / "}model:{" "}
                        <span className="font-mono text-zinc-200">
                          {report.phishingSimulation.model}
                        </span>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-5 text-zinc-200">
                  {report.phishingSimulation?.sms ??
                    "[샘플] 안녕하세요, 택배 관련 확인이 필요합니다. 주소/수령 가능 시간을 답장해 주세요."}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(report.phishingSimulation?.sms ?? "");
                        setActionToast("SMS를 복사했어요.");
                      } catch {
                        setActionToast("복사에 실패했어요.");
                      }
                    }}
                  >
                    SMS 복사
                  </Button>
                </div>

                {report.phishingSimulation?.voiceScript ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs text-zinc-400">보이스피싱 대본(훈련용)</div>
                    <div className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-zinc-200">
                      {report.phishingSimulation.voiceScript}
                    </div>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(report.phishingSimulation?.voiceScript ?? "");
                            setActionToast("대본을 복사했어요.");
                          } catch {
                            setActionToast("복사에 실패했어요.");
                          }
                        }}
                      >
                        대본 복사
                      </Button>
                    </div>
                  </div>
                ) : null}

                {!demo && phishing.state.kind === "error" ? (
                  <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-white/90">
                    생성 오류: <span className="font-mono">{phishing.state.message}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-white">해커 코멘트</h3>
                <p className="mt-2 text-sm text-zinc-300">
                  “정확한 주소가 없어도, 동선/휴가 일정/가족 정보만으로 표적화가 가능합니다.”
                </p>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
                  이 탭의 목적은 공포가 아니라, 실제로 속기 쉬운 말투를 안전하게 체험하고 방어 습관을 만드는 것입니다.
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      {actionToast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2">
          <div className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-center text-sm text-zinc-100 backdrop-blur-sm">
            {actionToast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
