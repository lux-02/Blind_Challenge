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
    const pieces = report.extractedPieces ?? [];
    const findings = report.imageFindings ?? [];
    const risks = report.riskNodes ?? [];
    const scenarios = report.scenarios ?? [];
    const llmEdges = report.attackGraph?.edges ?? [];

    const scenarioById = new Map<string, (typeof scenarios)[number]>();
    for (const s of scenarios) scenarioById.set(s.id, s);

    const xPiece = 40;
    const xRisk = 360;
    const xScenario = 690;

    const yStart = 40;
    const yGap = 120;

    const outNodes: Node<GraphNodeData>[] = [];
    const outEdges: Edge<GraphEdgeData>[] = [];

    // Piece nodes
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const id = `piece-${i}`;
      const label = `${p.type}\n${p.value}`;
      outNodes.push({
        id,
        position: { x: xPiece, y: yStart + i * yGap },
        data: { kind: "piece", label, pieceIndex: i },
        ...nodeBase,
        style: {
          ...nodeBase.style,
          border: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
        },
      });
    }

    // Image-finding nodes (same left layer, below text pieces)
    const yImgStart = yStart + pieces.length * yGap + (pieces.length ? 40 : 0);
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const id = `img-${i}`;
      const shortExcerpt =
        f.excerpt.length > 70 ? `${f.excerpt.slice(0, 70)}…` : f.excerpt;
      const label = `image:${f.severity}\n${f.label}\n${shortExcerpt}`;
        outNodes.push({
          id,
          position: { x: xPiece, y: yImgStart + i * yGap },
          data: { kind: "image", label, findingIndex: i, severity: f.severity },
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

    // Risk nodes
    for (let i = 0; i < risks.length; i++) {
      const r = risks[i];
      const id = `risk-${r.id}`;
        outNodes.push({
          id,
          position: { x: xRisk, y: yStart + i * yGap },
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

    // Scenario nodes
    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      const id = `scenario-${s.id}`;
      outNodes.push({
        id,
        position: { x: xScenario, y: yStart + i * yGap },
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

    // piece -> risk edges (top 1-2)
    const riskOrder = risks
      .slice()
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
    const nodeIds = new Set(outNodes.map((n) => n.id));

    function pushLLMEdge(e: (typeof llmEdges)[number]) {
      const strength = typeof e.strength === "number" ? Math.max(0, Math.min(1, e.strength)) : 0.5;
      const opacity = 0.25 + 0.75 * strength;
      const strokeWidth = 1.4 + 2.8 * strength;

      let sourceId = "";
      if (e.source.kind === "piece") sourceId = `piece-${e.source.index}`;
      else if (e.source.kind === "image") sourceId = `img-${e.source.index}`;
      else sourceId = `risk-${e.source.riskId}`;

      let targetId = "";
      if (e.target.kind === "risk") targetId = `risk-${e.target.riskId}`;
      else targetId = `scenario-${e.target.scenarioId}`;

      if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return;

      // Monochrome HUD: encode types via dash patterns, not color.
      const stroke = `rgba(255,255,255,${opacity})`;
      const strokeDasharray =
        e.source.kind === "piece" ? "6 6" : e.source.kind === "image" ? "2 6" : undefined;

      outEdges.push({
        id: `llm-${e.id}`,
        source: sourceId,
        target: targetId,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: stroke },
        style: { stroke, strokeWidth, strokeDasharray },
        data: { reason: e.reason, strength },
      });
    }

    if (llmEdges.length) {
      for (const e of llmEdges) pushLLMEdge(e);
    } else {
      // Heuristic fallback: piece -> risk edges (top 1-2)
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        const scored = risks
          .map((r) => ({ r, s: scoreRiskForPiece(p, r) }))
          .sort((a, b) => b.s - a.s);

        const picks = scored.filter((x) => x.s >= 6).slice(0, 2);
        const finalPicks = picks.length
          ? picks
          : riskOrder
              .slice(0, Math.min(1, riskOrder.length))
              .map((r) => ({ r, s: 0 }));

        for (const pk of finalPicks) {
          outEdges.push({
            id: `e-piece-${i}-risk-${pk.r.id}`,
            source: `piece-${i}`,
            target: `risk-${pk.r.id}`,
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 18,
              height: 18,
              color: "rgba(255,255,255,0.72)",
            },
            style: { stroke: "rgba(255,255,255,0.72)", strokeWidth: 2, strokeDasharray: "6 6" },
            data: { strength: 0.6 },
          });
        }
      }

      // image -> risk edges (top 1)
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        const scored = risks
          .map((r) => ({ r, s: scoreRiskForImageFinding(f, r) }))
          .sort((a, b) => b.s - a.s);
        const best = scored[0]?.r ?? riskOrder[0];
        if (!best) continue;
        outEdges.push({
          id: `e-img-${i}-risk-${best.id}`,
          source: `img-${i}`,
          target: `risk-${best.id}`,
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: "rgba(255,255,255,0.62)",
          },
          style: {
            stroke: "rgba(255,255,255,0.62)",
            strokeWidth: 2,
            strokeDasharray: "2 6",
          },
          data: { strength: 0.6 },
        });
      }

      // risk -> scenario edges (top 1 per scenario; fallback to highest severity)
      const topRisk = riskOrder[0];
      for (const s of scenarios) {
        const scored = risks
          .map((r) => ({ r, s: scoreRiskForScenario(r, s) }))
          .sort((a, b) => b.s - a.s);
        const best = scored[0]?.r ?? topRisk;
        if (!best) continue;
        outEdges.push({
          id: `e-risk-${best.id}-scenario-${s.id}`,
          source: `risk-${best.id}`,
          target: `scenario-${s.id}`,
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: "rgba(255,255,255,0.82)",
          },
          style: { stroke: "rgba(255,255,255,0.82)", strokeWidth: 2.2 },
          data: { strength: 0.6 },
        });
      }
    }

    const edgeById = new Map<string, Edge<GraphEdgeData>>();
    for (const e of outEdges) edgeById.set(e.id, e);

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

    const filteredNodes = outNodes.filter(keepNode);
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = outEdges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
    );

    if (filters.highOnly) {
      // Reduce noise: keep only connected nodes in high-only mode.
      const connected = new Set<string>();
      for (const e of filteredEdges) {
        connected.add(e.source);
        connected.add(e.target);
      }
      const nodes2 = filteredNodes.filter((n) => connected.has(n.id));
      const nodeIds2 = new Set(nodes2.map((n) => n.id));
      const edges2 = filteredEdges.filter(
        (e) => nodeIds2.has(e.source) && nodeIds2.has(e.target),
      );
      const edgeById2 = new Map<string, Edge<GraphEdgeData>>();
      for (const e of edges2) edgeById2.set(e.id, e);
      return { nodes: nodes2, edges: edges2, scenarioById, edgeById: edgeById2 };
    }

    const edgeById2 = new Map<string, Edge<GraphEdgeData>>();
    for (const e of filteredEdges) edgeById2.set(e.id, e);
    return { nodes: filteredNodes, edges: filteredEdges, scenarioById, edgeById: edgeById2 };
  }, [
    filters.highOnly,
    filters.showImages,
    filters.showPieces,
    filters.showRisks,
    filters.showScenarios,
    report,
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
