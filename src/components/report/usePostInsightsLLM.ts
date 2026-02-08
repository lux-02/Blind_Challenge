"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlindReport, PostInsights } from "@/lib/types";
import { notifyStorageChanged } from "@/lib/storageBus";

const STORAGE_KEY = "blindchallenge:latestReport";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

export function usePostInsightsLLM(opts: {
  report: BlindReport | null;
  setReport: React.Dispatch<React.SetStateAction<BlindReport | null>>;
  disabled?: boolean;
}) {
  const { report, setReport, disabled = false } = opts;

  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "rate_limited"; retryAfterMs: number }
    | { kind: "error"; message: string }
    | { kind: "done" }
  >({ kind: "idle" });

  const lastRequestedKeyRef = useRef<string | null>(null);
  const inflightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      inflightRef.current = false;
    };
  }, []);

  const inputKey = useMemo(() => {
    if (!report) return null;
    const visionDone = report.vision?.status === "complete";
    const pieceCount = report.extractedPieces?.length ?? 0;
    const imgFindingCount = visionDone ? (report.imageFindings?.length ?? 0) : 0;
    const postCount = report.contents?.length ?? 0;
    return `${report.blogId}|posts${postCount}|p${pieceCount}|i${imgFindingCount}|v${visionDone ? "1" : "0"}`;
  }, [report]);

  const canRun = useMemo(() => {
    if (disabled) return false;
    if (!report) return false;
    if (report.vision?.status !== "complete") return false;
    if (!report.contents?.length) return false;
    // Even if pieces are sparse, image findings alone can still be meaningful.
    if (!report.extractedPieces?.length && !report.imageFindings?.length) return false;
    return true;
  }, [disabled, report]);

  const run = useCallback(async () => {
    const r = report;
    if (!r) return;
    if (!canRun) return;
    if (!inputKey) return;
    if (inflightRef.current) return;

    if (lastRequestedKeyRef.current === inputKey && r.postInsights?.posts?.length) {
      setState({ kind: "done" });
      return;
    }

    inflightRef.current = true;
    if (mountedRef.current) setState({ kind: "running" });

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/post-insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          blogId: r.blogId,
          contents: (r.contents ?? []).map((c) => ({
            logNo: c.logNo,
            url: c.url,
            title: c.title,
            publishedAt: c.publishedAt ?? "",
            categoryName: c.categoryName ?? "",
          })),
          extractedPieces: r.extractedPieces ?? [],
          imageFindings: r.imageFindings ?? [],
        }),
      });

      const text = await res.text();
      const parsed = text ? (JSON.parse(text) as unknown) : null;
      const json = isRecord(parsed) ? parsed : null;

      if (res.status === 429) {
        const retryAfterMs =
          json && typeof json.retryAfterMs === "number" && Number.isFinite(json.retryAfterMs)
            ? Math.max(1000, Math.min(120_000, Math.floor(json.retryAfterMs)))
            : 8000;
        inflightRef.current = false;
        if (mountedRef.current) setState({ kind: "rate_limited", retryAfterMs });
        await sleep(retryAfterMs);
        if (mountedRef.current) setState({ kind: "idle" });
        inflightRef.current = false;
        void run();
        return;
      }

      if (!res.ok) {
        throw new Error(
          json && typeof json.error === "string"
            ? json.error
            : `post_insights_api_${res.status}`,
        );
      }

      const insights = json as unknown as PostInsights;
      if (!insights || !Array.isArray((insights as { posts?: unknown }).posts)) {
        throw new Error("post_insights_invalid_response");
      }

      lastRequestedKeyRef.current = inputKey;

      setReport((prev) => {
        if (!prev) return prev;
        const next: BlindReport = {
          ...prev,
          postInsights: insights,
        };
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          notifyStorageChanged("session", STORAGE_KEY);
        } catch {
          // ignore
        }
        return next;
      });

      inflightRef.current = false;
      if (mountedRef.current) setState({ kind: "done" });
    } catch (e) {
      inflightRef.current = false;
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (mountedRef.current) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "post_insights_failed",
        });
      }
    }
  }, [canRun, inputKey, report, setReport]);

  useEffect(() => {
    if (!canRun) return;
    if (!report) return;
    if (!inputKey) return;

    const hasInsights = Boolean(report.postInsights?.posts?.length);
    const keyChanged = lastRequestedKeyRef.current !== inputKey;
    if (!hasInsights || keyChanged) void run();
  }, [canRun, inputKey, report, run]);

  const retry = useCallback(() => {
    lastRequestedKeyRef.current = null;
    void run();
  }, [run]);

  return { state, retry };
}

