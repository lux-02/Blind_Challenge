"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlindReport, ImageFinding, VisionCursor } from "@/lib/types";
import { scoreReport } from "@/lib/scoring";
import { notifyStorageChanged } from "@/lib/storageBus";

const STORAGE_KEY = "blindchallenge:latestReport";

function dedupeImageFindings(existing: ImageFinding[], incoming: ImageFinding[]) {
  const seen = new Set(existing.map((f) => `${f.postLogNo}:${f.imageIndex}:${f.label}`));
  const out = existing.slice();
  for (const f of incoming) {
    const k = `${f.postLogNo}:${f.imageIndex}:${f.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function buildCursor(postIndex: number, imageIndex: number): VisionCursor {
  return { postIndex, imageIndex };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toInt(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback;
}

function asCursor(v: unknown): VisionCursor | null {
  if (!isRecord(v)) return null;
  const postIndex = toInt(v.postIndex, -1);
  const imageIndex = toInt(v.imageIndex, -1);
  if (postIndex < 0 || imageIndex < 0) return null;
  return { postIndex, imageIndex };
}

function minimalVisionPosts(report: BlindReport) {
  return (report.contents ?? []).map((c) => ({
    logNo: c.logNo,
    url: c.url,
    title: c.title,
    publishedAt: c.publishedAt,
    images: c.images ?? [],
  }));
}

export function useVisionProgressive(opts: {
  report: BlindReport | null;
  setReport: React.Dispatch<React.SetStateAction<BlindReport | null>>;
  disabled?: boolean;
}) {
  const { report, setReport, disabled = false } = opts;

  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "rate_limited"; retryAfterMs: number }
    | { kind: "error"; message: string }
    | { kind: "done" }
  >({ kind: "idle" });

  const latestReportRef = useRef<BlindReport | null>(report);
  const pausedRef = useRef(paused);
  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runStepRef = useRef<() => void>(() => {});

  useEffect(() => {
    latestReportRef.current = report;
  }, [report]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const progress = useMemo(() => {
    const r = report;
    const total =
      typeof r?.vision?.totalImages === "number"
        ? r.vision.totalImages
        : (r?.contents ?? []).reduce((acc, c) => acc + (c.images?.length ?? 0), 0);
    const processed =
      typeof r?.vision?.processedImages === "number" ? r.vision.processedImages : 0;
    const status = r?.vision?.status ?? (total ? "pending" : "complete");
    return { total, processed, status };
  }, [report]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    runningRef.current = false;
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const schedule = useCallback((ms: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      runStepRef.current();
    }, ms);
  }, []);

  const runStep = useCallback(async () => {
    if (disabled) return;
    const r = latestReportRef.current;
    if (!r) return;
    if (pausedRef.current) return;

    const posts = minimalVisionPosts(r);
    if (!posts.length) {
      setState({ kind: "done" });
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          vision: { status: "complete", processedImages: 0, totalImages: 0 },
        };
      });
      return;
    }

    const total = posts.reduce((acc, p) => acc + (p.images?.length ?? 0), 0);
    if (!total) {
      setState({ kind: "done" });
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          vision: { status: "complete", processedImages: 0, totalImages: 0 },
        };
      });
      return;
    }

    const cursor =
      r.vision?.cursor && typeof r.vision.cursor.postIndex === "number" && typeof r.vision.cursor.imageIndex === "number"
        ? r.vision.cursor
        : buildCursor(0, 0);

    // Mark running early, but only allow one in-flight.
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ kind: "running" });

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          blogId: r.blogId,
          posts,
          cursor,
          maxImages: undefined,
        }),
      });

      const text = await res.text();
      const parsed = text ? safeJsonParse(text) : null;
      const json = isRecord(parsed) ? parsed : null;

      if (res.status === 429) {
        const retryAfterMs =
          typeof json?.retryAfterMs === "number" && Number.isFinite(json.retryAfterMs)
            ? Math.max(1000, Math.min(120_000, Math.floor(json.retryAfterMs)))
            : 8000;
        const cursorFromServer = asCursor(json?.cursor) ?? cursor;

        setReport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            vision: {
              status: "partial",
              processedImages:
                typeof json?.processedImages === "number" ? json.processedImages : prev.vision?.processedImages ?? 0,
              totalImages:
                typeof json?.totalImages === "number" ? json.totalImages : prev.vision?.totalImages ?? total,
              cursor: cursorFromServer,
            },
          };
        });

        setState({ kind: "rate_limited", retryAfterMs });
        runningRef.current = false;
        schedule(retryAfterMs);
        return;
      }

      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : `vision_api_${res.status}`);
      }

      const findings = Array.isArray(json?.findings) ? (json.findings as ImageFinding[]) : [];
      const cursorNext = json?.cursorNext ?? null;
      const done = Boolean(json?.done);
      const warning = typeof json?.warning === "string" ? json.warning : null;
      const processedImages =
        typeof json?.processedImages === "number" && Number.isFinite(json.processedImages)
          ? Math.max(0, Math.floor(json.processedImages))
          : 0;
      const totalImages =
        typeof json?.totalImages === "number" && Number.isFinite(json.totalImages)
          ? Math.max(0, Math.floor(json.totalImages))
          : total;

      setReport((prev) => {
        if (!prev) return prev;
        const merged = dedupeImageFindings(prev.imageFindings ?? [], findings);
        const nextCursor = asCursor(cursorNext) ?? undefined;

        const next: BlindReport = {
          ...prev,
          imageFindings: merged,
          vision: {
            status: done ? "complete" : merged.length ? "partial" : "pending",
            processedImages,
            totalImages,
            cursor: done ? undefined : nextCursor,
          },
        };
        if (warning) {
          next.warnings = [...(next.warnings ?? []).slice(0, 9), warning];
        }
        const scoring = scoreReport(next);
        next.scoring = scoring;
        next.riskScore = scoring.riskScore;

        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          notifyStorageChanged("session", STORAGE_KEY);
        } catch {
          // ignore
        }

        return next;
      });

      if (done) {
        setState({ kind: "done" });
        runningRef.current = false;
        return;
      }

      // Gentle pacing to avoid hitting TPM too quickly.
      const jitter = 1800 + Math.floor(Math.random() * 800);
      runningRef.current = false;
      schedule(jitter);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        runningRef.current = false;
        return;
      }
      const msg = e instanceof Error ? e.message : "vision_failed";
      setState({ kind: "error", message: msg });
      runningRef.current = false;
    }
  }, [disabled, schedule, setReport]);

  useEffect(() => {
    runStepRef.current = () => {
      void runStep();
    };
  }, [runStep]);

  useEffect(() => {
    const r = report;
    if (disabled) return;
    if (!r) return;
    if (paused) return;

    const total = progress.total;
    if (!total) return;
    if (r.vision?.status === "complete") return;

    // Start/continue loop.
    schedule(600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, report?.blogId, paused, progress.total]);

  const resume = useCallback(() => {
    setPaused(false);
    setState({ kind: "idle" });
    schedule(250);
  }, [schedule]);

  const pause = useCallback(() => {
    setPaused(true);
    stop();
  }, [stop]);

  return {
    paused,
    state,
    progress,
    pause,
    resume,
  };
}
