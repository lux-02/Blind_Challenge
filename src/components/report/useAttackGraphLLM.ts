"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttackGraph, BlindReport } from "@/lib/types";
import { notifyStorageChanged } from "@/lib/storageBus";

const STORAGE_KEY = "blindchallenge:latestReport";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

export function useAttackGraphLLM(opts: {
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
    const pieceCount = report.extractedPieces?.length ?? 0;
    const riskCount = report.riskNodes?.length ?? 0;
    const scenarioCount = report.scenarios?.length ?? 0;
    // We intentionally run the LLM graph twice:
    // 1) early (text-only or partial), 2) once after vision completes (final image findings).
    const visionDone = report.vision?.status === "complete";
    const imgCount = visionDone ? (report.imageFindings?.length ?? 0) : 0;
    return `${report.blogId}|p${pieceCount}|i${imgCount}|r${riskCount}|s${scenarioCount}|v${visionDone ? "1" : "0"}`;
  }, [report]);

  const canRun = useMemo(() => {
    if (disabled) return false;
    if (!report) return false;
    if (!report.extractedPieces?.length && !report.imageFindings?.length) return false;
    if (!report.riskNodes?.length || !report.scenarios?.length) return false;
    return true;
  }, [disabled, report]);

  const run = useCallback(async () => {
    const r = report;
    if (!r) return;
    if (!canRun) return;
    if (!inputKey) return;
    if (inflightRef.current) return;

    // Avoid spamming the API for the same input.
    if (lastRequestedKeyRef.current === inputKey && r.attackGraph?.edges?.length) {
      setState({ kind: "done" });
      return;
    }

    inflightRef.current = true;
    if (mountedRef.current) setState({ kind: "running" });

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/graph", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          blogId: r.blogId,
          extractedPieces: r.extractedPieces ?? [],
          imageFindings: r.vision?.status === "complete" ? r.imageFindings ?? [] : [],
          riskNodes: r.riskNodes ?? [],
          scenarios: r.scenarios ?? [],
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
        // Retry once, but allow key check to prevent loops.
        if (mountedRef.current) setState({ kind: "idle" });
        inflightRef.current = false;
        void run();
        return;
      }

      if (!res.ok) {
        throw new Error(
          json && typeof json.error === "string" ? json.error : `graph_api_${res.status}`,
        );
      }

      const graph = json as unknown as AttackGraph;
      if (!graph || !Array.isArray((graph as { edges?: unknown }).edges)) {
        throw new Error("graph_invalid_response");
      }

      lastRequestedKeyRef.current = inputKey;

      setReport((prev) => {
        if (!prev) return prev;
        const next: BlindReport = {
          ...prev,
          attackGraph: graph,
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
          message: e instanceof Error ? e.message : "graph_failed",
        });
      }
    }
  }, [canRun, inputKey, report, setReport]);

  useEffect(() => {
    if (!canRun) return;
    if (!report) return;
    if (!inputKey) return;

    // Run when graph missing, or when Vision completes and inputs changed.
    const hasGraph = Boolean(report.attackGraph?.edges?.length);
    const keyChanged = lastRequestedKeyRef.current !== inputKey;
    if (!hasGraph || keyChanged) {
      void run();
    }
  }, [canRun, inputKey, report, run]);

  const retry = useCallback(() => {
    lastRequestedKeyRef.current = null;
    void run();
  }, [run]);

  return { state, retry };
}
