"use client";

import "reactflow/dist/style.css";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type ReactFlowInstance,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import type { BlindReport } from "@/lib/types";

type Props = {
  report: BlindReport;
  onSelectPiece: (pieceIndex: number) => void;
  onSelectImageFinding: (findingIndex: number) => void;
  viewMode?: "summary" | "full";
  filters?: {
    showPieces: boolean;
    showImages: boolean;
    showRisks: boolean;
    showScenarios: boolean;
    highOnly: boolean;
  };
  onInspectChange?: (
    v:
      | { kind: "edge"; reason: string; strength?: number }
      | { kind: "scenario"; scenario: BlindReport["scenarios"][number] }
      | null,
  ) => void;
};

type GraphNodeData = {
  kind: "piece" | "image" | "risk" | "scenario";
  label: string;
  pieceIndex?: number;
  findingIndex?: number;
  riskId?: string;
  scenarioId?: string;
  severity?: "low" | "medium" | "high";
};

type GraphEdgeData = {
  reason?: string;
  strength?: number;
};

const nodeBase = {
  style: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    color: "rgba(255,255,255,0.92)",
    padding: 12,
    width: 230,
    boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
  },
} as const;

function norm(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}

function severityWeight(sev: string) {
  if (sev === "high") return 3;
  if (sev === "medium") return 2;
  return 1;
}

function scoreRiskForPiece(
  piece: NonNullable<BlindReport["extractedPieces"]>[number],
  risk: NonNullable<BlindReport["riskNodes"]>[number],
) {
  const label = norm(risk.label);
  const val = norm(piece.value);

  let s = severityWeight(risk.severity);

  if (piece.type === "family") {
    if (label.includes("가족") || label.includes("관계") || label.includes("친구")) s += 5;
  } else if (piece.type === "schedule") {
    if (label.includes("패턴") || label.includes("일상") || label.includes("루틴")) s += 5;
  } else if (piece.type === "address_hint" || piece.type === "photo_metadata") {
    if (label.includes("위치") || label.includes("주소") || label.includes("동네")) s += 5;
  }

  // Keyword nudges for "other"
  if (val.includes("회식") || val.includes("부장") || val.includes("직장") || val.includes("회사")) {
    if (label.includes("직장") || label.includes("업무") || label.includes("회사")) s += 5;
  }
  if (val.includes("학교") || val.includes("학원")) {
    if (label.includes("가족") || label.includes("관계") || label.includes("자녀")) s += 2;
  }
  if (val.includes("카페") || val.includes("연남") || val.includes("역") || val.includes("성당")) {
    if (label.includes("위치") || label.includes("동선") || label.includes("활동")) s += 2;
  }

  return s;
}

function scoreRiskForImageFinding(
  finding: NonNullable<BlindReport["imageFindings"]>[number],
  risk: NonNullable<BlindReport["riskNodes"]>[number],
) {
  const label = norm(risk.label);
  const f = norm(`${finding.label}\n${finding.excerpt}\n${finding.rationale}`);

  let s = severityWeight(risk.severity);
  const sev = finding.severity === "high" ? 3 : finding.severity === "medium" ? 2 : 1;
  s += sev;

  // Keyword matching
  const pairs: Array<[string[], string[]]> = [
    [["주소", "위치", "동선", "동네", "지도", "간판", "상호"], ["주소", "위치", "동선", "동네", "지도", "간판", "상호"]],
    [["가족", "관계", "친구", "자녀", "아이"], ["가족", "관계", "친구", "자녀", "아이"]],
    [["직장", "업무", "회사", "소속", "명찰", "사원증"], ["직장", "업무", "회사", "소속", "명찰", "사원증"]],
    [["생활", "패턴", "루틴", "일상", "시간"], ["생활", "패턴", "루틴", "일상", "시간"]],
  ];
  for (const [riskKeys, findKeys] of pairs) {
    if (riskKeys.some((k) => label.includes(norm(k))) && findKeys.some((k) => f.includes(norm(k)))) {
      s += 5;
    }
  }

  if (f.includes("송장") || f.includes("라벨") || f.includes("배송") || f.includes("택배")) {
    if (label.includes("주소") || label.includes("위치") || label.includes("식별") || label.includes("자산")) s += 5;
  }

  return s;
}

function scoreRiskForScenario(
  risk: NonNullable<BlindReport["riskNodes"]>[number],
  scenario: NonNullable<BlindReport["scenarios"]>[number],
) {
  const label = norm(risk.label);
  const text = norm(`${scenario.title}\n${scenario.narrative}`);
  let s = severityWeight(risk.severity);

  // Simple substring match on key Korean concepts.
  const keys = ["가족", "관계", "친구", "직장", "업무", "생활", "패턴", "위치", "주소", "동선"];
  for (const k of keys) {
    if (label.includes(k) && text.includes(k)) s += 4;
  }
  if (text.includes(label)) s += 3;
  return s;
}

export default function AttackPathGraph({
  report,
  onSelectPiece,
  onSelectImageFinding,
  viewMode = "summary",
  filters = {
    showPieces: true,
    showImages: true,
    showRisks: true,
    showScenarios: true,
    highOnly: false,
  },
  onInspectChange,
}: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const lastCountsRef = useRef<{ pieces: number; findings: number }>({
    pieces: -1,
    findings: -1,
  });

  const { nodes, edges, scenarioById, edgeById } = useMemo(() => {
    const piecesAll = report.extractedPieces ?? [];
    const findingsAll = report.imageFindings ?? [];
    const risksAll = report.riskNodes ?? [];
    const scenariosAll = report.scenarios ?? [];
    const llmEdges = report.attackGraph?.edges ?? [];

    const scenarioById = new Map<string, (typeof scenariosAll)[number]>();
    for (const s of scenariosAll) scenarioById.set(s.id, s);

    const xPiece = 40;
    const xRisk = 360;
    const xScenario = 690;

    const outNodes: Node<GraphNodeData>[] = [];
    const outEdges: Edge<GraphEdgeData>[] = [];

    // Nodes (positions will be assigned after we build/trim edges).
    for (let i = 0; i < piecesAll.length; i++) {
      const p = piecesAll[i]!;
      outNodes.push({
        id: `piece-${i}`,
        position: { x: 0, y: 0 },
        data: { kind: "piece", label: `${p.type}\n${p.value}`, pieceIndex: i },
        ...nodeBase,
        style: {
          ...nodeBase.style,
          border: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
        },
      });
    }

    for (let i = 0; i < findingsAll.length; i++) {
      const f = findingsAll[i]!;
      const shortExcerpt = f.excerpt.length > 70 ? `${f.excerpt.slice(0, 70)}…` : f.excerpt;
      outNodes.push({
        id: `img-${i}`,
        position: { x: 0, y: 0 },
        data: {
          kind: "image",
          label: `image:${f.severity}\n${f.label}\n${shortExcerpt}`,
          findingIndex: i,
          severity: f.severity,
        },
        ...nodeBase,
        style: {
          ...nodeBase.style,
          border:
            f.severity === "high"
              ? "1px solid rgba(255,255,255,0.46)"
              : f.severity === "medium"
                ? "1px solid rgba(255,255,255,0.34)"
                : "1px solid rgba(255,255,255,0.22)",
          background:
            f.severity === "high"
              ? "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.35))"
              : f.severity === "medium"
                ? "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(0,0,0,0.35))"
                : "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
        },
      });
    }

    for (let i = 0; i < risksAll.length; i++) {
      const r = risksAll[i]!;
      outNodes.push({
        id: `risk-${r.id}`,
        position: { x: 0, y: 0 },
        data: { kind: "risk", label: r.label, riskId: r.id, severity: r.severity },
        ...nodeBase,
        style: {
          ...nodeBase.style,
          border:
            r.severity === "high"
              ? "1px solid rgba(255,255,255,0.46)"
              : r.severity === "medium"
                ? "1px solid rgba(255,255,255,0.34)"
                : "1px solid rgba(255,255,255,0.22)",
          background:
            r.severity === "high"
              ? "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.35))"
              : r.severity === "medium"
                ? "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(0,0,0,0.35))"
                : "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
        },
      });
    }

    for (let i = 0; i < scenariosAll.length; i++) {
      const s = scenariosAll[i]!;
      outNodes.push({
        id: `scenario-${s.id}`,
        position: { x: 0, y: 0 },
        data: { kind: "scenario", label: s.title, scenarioId: s.id },
        ...nodeBase,
        style: {
          ...nodeBase.style,
          width: 260,
          border: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.40))",
        },
      });
    }

    const nodeIds = new Set(outNodes.map((n) => n.id));

    function pushEdge(opts: {
      id: string;
      source: string;
      target: string;
      dash?: string;
      strength?: number;
      reason?: string;
      opacityBase?: number;
    }) {
      if (!nodeIds.has(opts.source) || !nodeIds.has(opts.target)) return;
      const strength = typeof opts.strength === "number" ? Math.max(0, Math.min(1, opts.strength)) : 0.6;
      const opacity = (opts.opacityBase ?? 0.25) + 0.75 * strength;
      const strokeWidth = 1.4 + 2.8 * strength;
      const stroke = `rgba(255,255,255,${opacity})`;
      outEdges.push({
        id: opts.id,
        source: opts.source,
        target: opts.target,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: stroke },
        style: { stroke, strokeWidth, strokeDasharray: opts.dash },
        data: { reason: opts.reason, strength },
      });
    }

    const riskOrder = risksAll
      .slice()
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

    if (llmEdges.length) {
      for (const e of llmEdges) {
        const strength = typeof e.strength === "number" ? Math.max(0, Math.min(1, e.strength)) : 0.55;
        let sourceId = "";
        if (e.source.kind === "piece") sourceId = `piece-${e.source.index}`;
        else if (e.source.kind === "image") sourceId = `img-${e.source.index}`;
        else sourceId = `risk-${e.source.riskId}`;

        let targetId = "";
        if (e.target.kind === "risk") targetId = `risk-${e.target.riskId}`;
        else targetId = `scenario-${e.target.scenarioId}`;

        pushEdge({
          id: `llm-${e.id}`,
          source: sourceId,
          target: targetId,
          dash: e.source.kind === "piece" ? "6 6" : e.source.kind === "image" ? "2 6" : undefined,
          strength,
          reason: e.reason,
          opacityBase: 0.2,
        });
      }
    } else {
      // Heuristic fallback: piece -> risk edges (top 1-2)
      for (let i = 0; i < piecesAll.length; i++) {
        const p = piecesAll[i]!;
        const scored = risksAll
          .map((r) => ({ r, s: scoreRiskForPiece(p, r) }))
          .sort((a, b) => b.s - a.s);

        const picks = scored.filter((x) => x.s >= 6).slice(0, 2);
        const finalPicks = picks.length
          ? picks
          : riskOrder
              .slice(0, Math.min(1, riskOrder.length))
              .map((r) => ({ r, s: 0 }));

        for (const pk of finalPicks) {
          pushEdge({
            id: `e-piece-${i}-risk-${pk.r.id}`,
            source: `piece-${i}`,
            target: `risk-${pk.r.id}`,
            dash: "6 6",
            strength: 0.6,
          });
        }
      }

      // image -> risk edges (top 1)
      for (let i = 0; i < findingsAll.length; i++) {
        const f = findingsAll[i]!;
        const scored = risksAll
          .map((r) => ({ r, s: scoreRiskForImageFinding(f, r) }))
          .sort((a, b) => b.s - a.s);
        const best = scored[0]?.r ?? riskOrder[0];
        if (!best) continue;
        pushEdge({
          id: `e-img-${i}-risk-${best.id}`,
          source: `img-${i}`,
          target: `risk-${best.id}`,
          dash: "2 6",
          strength: 0.6,
        });
      }

      // risk -> scenario edges (top 1 per scenario; fallback to highest severity)
      const topRisk = riskOrder[0];
      for (const s of scenariosAll) {
        const scored = risksAll
          .map((r) => ({ r, s: scoreRiskForScenario(r, s) }))
          .sort((a, b) => b.s - a.s);
        const best = scored[0]?.r ?? topRisk;
        if (!best) continue;
        pushEdge({
          id: `e-risk-${best.id}-scenario-${s.id}`,
          source: `risk-${best.id}`,
          target: `scenario-${s.id}`,
          strength: 0.6,
        });
      }
    }

    function keepNode(n: Node<GraphNodeData>) {
      const k = n.data.kind;
      if (k === "piece" && !filters.showPieces) return false;
      if (k === "image" && !filters.showImages) return false;
      if (k === "risk" && !filters.showRisks) return false;
      if (k === "scenario" && !filters.showScenarios) return false;
      if (filters.highOnly) {
        if (k === "image" && n.data.severity !== "high") return false;
        if (k === "risk" && n.data.severity !== "high") return false;
      }
      return true;
    }

    // Apply base filters first (toggle chips).
    let nodes1 = outNodes.filter(keepNode);
    let nodeIdSet1 = new Set(nodes1.map((n) => n.id));
    let edges1 = outEdges.filter((e) => nodeIdSet1.has(e.source) && nodeIdSet1.has(e.target));

    // Summary view: reduce noise and cluster around higher-signal risks.
    if (viewMode === "summary") {
      // Keep only strong-ish connections when using LLM edges.
      if (llmEdges.length) {
        edges1 = edges1.filter((e) => (e.data?.strength ?? 0.6) >= 0.55);
      }

      const degree = new Map<string, number>();
      for (const e of edges1) {
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      }

      // Pick a compact set of risk nodes.
      const riskNodes = nodes1.filter((n) => n.data.kind === "risk");
      const rankedRisks = riskNodes
        .map((n) => {
          const sev = n.data.severity ?? "low";
          const d = degree.get(n.id) ?? 0;
          return { id: n.id, sev, d };
        })
        .sort((a, b) => severityWeight(b.sev) * 10 + b.d - (severityWeight(a.sev) * 10 + a.d));

      const keepRiskIds = new Set<string>();
      for (const r of rankedRisks) {
        if (r.sev === "high") keepRiskIds.add(r.id);
      }
      for (const r of rankedRisks) {
        if (keepRiskIds.size >= 8) break;
        if (r.d >= 2) keepRiskIds.add(r.id);
      }
      // If still empty, keep at least one.
      if (!keepRiskIds.size && rankedRisks[0]) keepRiskIds.add(rankedRisks[0].id);

      // For each kept risk, keep a small number of connected pieces/images.
      const keepNodeIds = new Set<string>(Array.from(keepRiskIds));
      const edgeStrength = (e: Edge<GraphEdgeData>) => (e.data?.strength ?? 0.6);

      const edgesByRisk = new Map<string, Edge<GraphEdgeData>[]>();
      for (const e of edges1) {
        // We treat "risk-* as hub": include piece/img -> risk and risk -> scenario.
        if (e.target.startsWith("risk-") && keepRiskIds.has(e.target)) {
          const list = edgesByRisk.get(e.target) ?? [];
          list.push(e);
          edgesByRisk.set(e.target, list);
        }
        if (e.source.startsWith("risk-") && keepRiskIds.has(e.source)) {
          const list = edgesByRisk.get(e.source) ?? [];
          list.push(e);
          edgesByRisk.set(e.source, list);
        }
      }

      for (const riskId of keepRiskIds) {
        const list = (edgesByRisk.get(riskId) ?? []).slice().sort((a, b) => edgeStrength(b) - edgeStrength(a));
        const pieceEdges = list.filter((e) => e.source.startsWith("piece-")).slice(0, 4);
        const imgEdges = list.filter((e) => e.source.startsWith("img-")).slice(0, 3);
        for (const e of pieceEdges) keepNodeIds.add(e.source);
        for (const e of imgEdges) keepNodeIds.add(e.source);

        // scenarios connected from risk
        const scnEdges = list.filter((e) => e.target.startsWith("scenario-")).slice(0, 2);
        for (const e of scnEdges) keepNodeIds.add(e.target);
      }

      // Collapse duplicate piece values (only within kept set).
      const pieceNodesKept = nodes1.filter((n) => n.data.kind === "piece" && keepNodeIds.has(n.id));
      const repByNorm = new Map<string, { repId: string; count: number }>();
      const pieceRepMap = new Map<string, string>();
      for (const n of pieceNodesKept) {
        const idx = n.data.pieceIndex ?? -1;
        const val = idx >= 0 ? piecesAll[idx]?.value ?? "" : "";
        const k = norm(val);
        if (!k) continue;
        const prev = repByNorm.get(k);
        if (!prev) {
          repByNorm.set(k, { repId: n.id, count: 1 });
          pieceRepMap.set(n.id, n.id);
        } else {
          prev.count += 1;
          pieceRepMap.set(n.id, prev.repId);
        }
      }

      const dedup = edges1
        .map((e) => {
          if (e.source.startsWith("piece-")) {
            const mapped = pieceRepMap.get(e.source) ?? e.source;
            return mapped === e.source ? e : { ...e, source: mapped, id: `${e.id}-d` };
          }
          return e;
        })
        // After remap, we may create duplicates. Dedup by source->target keep strongest.
        .reduce((acc, e) => {
          const k = `${e.source}=>${e.target}`;
          const prev = acc.get(k);
          if (!prev || (prev.data?.strength ?? 0.6) < (e.data?.strength ?? 0.6)) acc.set(k, e);
          return acc;
        }, new Map<string, Edge<GraphEdgeData>>());
      edges1 = Array.from(dedup.values());

      // Recompute keep set after collapse.
      const keep2 = new Set<string>(Array.from(keepRiskIds));
      for (const e of edges1) {
        if (keep2.has(e.source) || keep2.has(e.target)) {
          keep2.add(e.source);
          keep2.add(e.target);
        }
      }
      // Also keep scenario nodes already picked.
      for (const id of keepNodeIds) keep2.add(id);
      keepNodeIds.clear();
      for (const id of keep2) keepNodeIds.add(id);

      nodes1 = nodes1
        .filter((n) => keepNodeIds.has(n.id))
        .map((n) => {
          if (n.data.kind !== "piece") return n;
          const idx = n.data.pieceIndex ?? -1;
          const val = idx >= 0 ? piecesAll[idx]?.value ?? "" : "";
          const k = norm(val);
          const rep = k ? repByNorm.get(k) : null;
          if (!rep || rep.repId !== n.id || rep.count <= 1) return n;
          return {
            ...n,
            data: {
              ...n.data,
              label: `${n.data.label}\n(x${rep.count})`,
            },
          };
        });

      nodeIdSet1 = new Set(nodes1.map((n) => n.id));
      edges1 = edges1.filter((e) => nodeIdSet1.has(e.source) && nodeIdSet1.has(e.target));
    }

    // High-only mode: keep only connected nodes (noise reduction).
    if (filters.highOnly) {
      const connected = new Set<string>();
      for (const e of edges1) {
        connected.add(e.source);
        connected.add(e.target);
      }
      const nodes2 = nodes1.filter((n) => connected.has(n.id));
      const nodeIds2 = new Set(nodes2.map((n) => n.id));
      edges1 = edges1.filter((e) => nodeIds2.has(e.source) && nodeIds2.has(e.target));
      nodes1 = nodes2;
    }

    // Layout: risk-centered clustering based on connectivity.
    const byId = new Map<string, Node<GraphNodeData>>();
    for (const n of nodes1) byId.set(n.id, n);

    const edgesByNode = new Map<string, Edge<GraphEdgeData>[]>();
    for (const e of edges1) {
      const a = edgesByNode.get(e.source) ?? [];
      a.push(e);
      edgesByNode.set(e.source, a);
      const b = edgesByNode.get(e.target) ?? [];
      b.push(e);
      edgesByNode.set(e.target, b);
    }

    const riskNodes = nodes1.filter((n) => n.data.kind === "risk");
    const riskOrder2 = riskNodes
      .map((n) => {
        const sev = n.data.severity ?? "low";
        const deg = edgesByNode.get(n.id)?.length ?? 0;
        return { id: n.id, sev, deg };
      })
      .sort((a, b) => severityWeight(b.sev) * 100 + b.deg - (severityWeight(a.sev) * 100 + a.deg));

    // Assign risk y blocks.
    const yPad = 50;
    const blockGap = 70;
    let yCursor = yPad;
    const riskY = new Map<string, number>();
    for (const r of riskOrder2) {
      const eid = r.id;
      const conns = edgesByNode.get(eid) ?? [];
      const leftCount = conns.filter((e) => e.source.startsWith("piece-") || e.source.startsWith("img-")).length;
      const block = Math.max(150, leftCount * 90);
      const center = yCursor + block / 2;
      riskY.set(eid, center);
      yCursor += block + blockGap;
    }

    // Place left nodes near their primary risk.
    function primaryRiskForSource(srcId: string): string | null {
      const conns = edgesByNode.get(srcId) ?? [];
      const toRisks = conns
        .filter((e) => e.source === srcId && e.target.startsWith("risk-"))
        .map((e) => ({ riskId: e.target, s: e.data?.strength ?? 0.6 }))
        .sort((a, b) => b.s - a.s);
      return toRisks[0]?.riskId ?? null;
    }

    const leftNodes = nodes1.filter((n) => n.data.kind === "piece" || n.data.kind === "image");
    const byRiskLeft = new Map<string, Node<GraphNodeData>[]>();
    for (const n of leftNodes) {
      const pr = primaryRiskForSource(n.id);
      const riskId = pr && riskY.has(pr) ? pr : riskOrder2[0]?.id ?? null;
      if (!riskId) continue;
      const list = byRiskLeft.get(riskId) ?? [];
      list.push(n);
      byRiskLeft.set(riskId, list);
    }

    for (const [rid, list] of byRiskLeft.entries()) {
      const center = riskY.get(rid) ?? 0;
      const sorted = list.slice().sort((a, b) => {
        const as = edgesByNode.get(a.id)?.length ?? 0;
        const bs = edgesByNode.get(b.id)?.length ?? 0;
        return bs - as;
      });
      const gap = 92;
      const start = center - (sorted.length - 1) * (gap / 2);
      for (let i = 0; i < sorted.length; i++) {
        const n = sorted[i]!;
        byId.set(n.id, { ...n, position: { x: xPiece, y: start + i * gap } });
      }
    }

    // Place risks.
    for (const r of riskOrder2) {
      const n = byId.get(r.id);
      if (!n) continue;
      byId.set(r.id, { ...n, position: { x: xRisk, y: riskY.get(r.id) ?? 0 } });
    }

    // Place scenarios aligned to connected risks.
    const scenarioNodes = nodes1.filter((n) => n.data.kind === "scenario");
    for (const n of scenarioNodes) {
      const conns = edgesByNode.get(n.id) ?? [];
      const fromRisks = conns
        .filter((e) => e.target === n.id && e.source.startsWith("risk-"))
        .map((e) => riskY.get(e.source) ?? null)
        .filter((x): x is number => typeof x === "number");
      const y =
        fromRisks.length
          ? fromRisks.reduce((a, b) => a + b, 0) / fromRisks.length
          : yPad;
      byId.set(n.id, { ...n, position: { x: xScenario, y } });
    }

    // Finalize nodes list in stable order (risk/scenario first for readability).
    const nodesFinal = nodes1
      .slice()
      .sort((a, b) => {
        const ka = a.data.kind;
        const kb = b.data.kind;
        const wa = ka === "risk" ? 0 : ka === "scenario" ? 1 : 2;
        const wb = kb === "risk" ? 0 : kb === "scenario" ? 1 : 2;
        if (wa !== wb) return wa - wb;
        return a.id.localeCompare(b.id);
      })
      .map((n) => byId.get(n.id) ?? n);

    const edgeById = new Map<string, Edge<GraphEdgeData>>();
    for (const e of edges1) edgeById.set(e.id, e);
    return { nodes: nodesFinal, edges: edges1, scenarioById, edgeById };
  }, [
    filters.highOnly,
    filters.showImages,
    filters.showPieces,
    filters.showRisks,
    filters.showScenarios,
    report,
    viewMode,
  ]);

  useEffect(() => {
    const inst = rfRef.current;
    if (!inst) return;

    const pieces = report.extractedPieces?.length ?? 0;
    const findings = report.imageFindings?.length ?? 0;
    const last = lastCountsRef.current;

    // When progressive Vision adds image nodes later, they may land outside the
    // initial viewport. Re-fit once on count increases.
    const grew = pieces > last.pieces || findings > last.findings;
    lastCountsRef.current = { pieces, findings };
    if (!grew) return;

    // Avoid aggressive re-fitting: only refit when new image findings arrive.
    if (last.findings >= 0 && findings > last.findings) {
      // duration is best-effort; ReactFlow ignores it in some cases.
      try {
        inst.fitView({ padding: 0.18, duration: 450 });
      } catch {
        // ignore
      }
    }
  }, [report.extractedPieces?.length, report.imageFindings?.length]);

  const nodesWithSelection = useMemo(() => {
    if (!selectedNodeId) return nodes;
    return nodes.map((n) => {
      const selected = n.id === selectedNodeId;
      return {
        ...n,
        style: {
          ...(n.style ?? {}),
          border: selected
            ? "1px solid rgba(255,255,255,0.70)"
            : n.style?.border,
          boxShadow: selected
            ? "0 0 0 3px rgba(255,255,255,0.12)"
            : n.style?.boxShadow,
        },
      };
    });
  }, [nodes, selectedNodeId]);

  const edgesWithSelection = useMemo(() => {
    if (!selectedEdgeId) return edges;
    return edges.map((e) => {
      const selected = e.id === selectedEdgeId;
      const style = (e.style ?? {}) as Record<string, unknown>;
      const prevStrokeWidth =
        typeof style.strokeWidth === "number" ? style.strokeWidth : undefined;
      return {
        ...e,
        style: {
          ...(e.style ?? {}),
          stroke: selected ? "rgba(255,255,255,0.92)" : e.style?.stroke,
          strokeWidth: selected ? 3 : prevStrokeWidth,
        },
      };
    });
  }, [edges, selectedEdgeId]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    onInspectChange?.(null);
    const data = node.data as GraphNodeData | undefined;
    if (!data) return;
    if (data.kind === "piece" && typeof data.pieceIndex === "number") {
      onSelectPiece(data.pieceIndex);
    }
    if (data.kind === "image" && typeof data.findingIndex === "number") {
      onSelectImageFinding(data.findingIndex);
    }
    if (data.kind === "scenario" && data.scenarioId) {
      const s = scenarioById.get(data.scenarioId) ?? null;
      if (s) onInspectChange?.({ kind: "scenario", scenario: s });
    }
  };

  const onEdgeClick: EdgeMouseHandler = (_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    const e2 = edgeById.get(edge.id) ?? null;
    const reason = e2?.data?.reason;
    if (reason) {
      onInspectChange?.({
        kind: "edge",
        reason,
        strength: e2.data?.strength,
      });
    } else {
      onInspectChange?.(null);
    }
  };

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edgesWithSelection}
        fitView
        onInit={(inst) => {
          rfRef.current = inst;
        }}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true }}
      >
        <MiniMap
          pannable
          zoomable
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
          nodeColor={() => "rgba(255,255,255,0.40)"}
        />
        <Controls
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        />
        <Background color="rgba(255,255,255,0.06)" gap={18} />
      </ReactFlow>
    </div>
  );
}
