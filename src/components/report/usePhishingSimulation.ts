"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlindReport } from "@/lib/types";
import { notifyStorageChanged } from "@/lib/storageBus";

const STORAGE_KEY = "blindchallenge:latestReport";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

export function usePhishingSimulation(opts: {
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

  const inflightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      inflightRef.current = false;
    };
  }, []);

  const canRun = useMemo(() => {
    if (disabled) return false;
    if (!report) return false;
    if (!report.riskNodes?.length || !report.scenarios?.length) return false;
    if (!report.extractedPieces?.length && !report.imageFindings?.length) return false;
    return true;
  }, [disabled, report]);

  const key = useMemo(() => {
    if (!report) return null;
    const p = report.extractedPieces?.length ?? 0;
    const i = report.imageFindings?.length ?? 0;
    const v = report.vision?.status === "complete" ? "1" : "0";
    return `${report.blogId}|p${p}|i${i}|v${v}`;
  }, [report]);

  const run = useCallback(async () => {
    const r = report;
    if (!r || !canRun || !key) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    if (mountedRef.current) setState({ kind: "running" });

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/phishing", {
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
        if (mountedRef.current) setState({ kind: "idle" });
        inflightRef.current = false;
        void run();
        return;
      }

      if (!res.ok) {
        throw new Error(
          json && typeof json.error === "string" ? json.error : `phishing_api_${res.status}`,
        );
      }

      const sms = json && typeof json.sms === "string" ? json.sms : "";
      const voiceScript = json && typeof json.voiceScript === "string" ? json.voiceScript : "";
      if (!sms || !voiceScript) throw new Error("phishing_invalid_response");
      const model = json && typeof json.model === "string" ? json.model : undefined;
      const generatedAt =
        json && typeof json.generatedAt === "string" ? json.generatedAt : undefined;

      lastKeyRef.current = key;

      setReport((prev) => {
        if (!prev) return prev;
        const next: BlindReport = {
          ...prev,
          phishingSimulation: {
            sms,
            voiceScript,
            model,
            generatedAt,
          },
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
        setState({ kind: "error", message: e instanceof Error ? e.message : "phishing_failed" });
      }
    }
  }, [canRun, key, report, setReport]);

  // Auto-run once when missing; allow manual regeneration.
  useEffect(() => {
    if (!canRun || !report || !key) return;
    const has = Boolean(report.phishingSimulation?.sms && report.phishingSimulation?.voiceScript);
    const stale = lastKeyRef.current !== key;
    if (!has || stale) {
      void run();
    }
  }, [canRun, key, report, run]);

  const retry = useCallback(() => {
    lastKeyRef.current = null;
    void run();
  }, [run]);

  return { state, retry };
}
