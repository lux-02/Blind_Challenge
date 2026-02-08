"use client";

import "reactflow/dist/style.css";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  MarkerType,
  type Node,
} from "reactflow";

const baseNode = {
  style: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    color: "rgba(255,255,255,0.92)",
    padding: 12,
    width: 220,
    boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
  },
} as const;

export default function SampleAttackGraph() {
  const nodes = useMemo<Node[]>(
    () => [
      {
        id: "d1",
        position: { x: 40, y: 70 },
        data: { label: "집 주소\n(택배 라벨/근처 랜드마크)" },
        ...baseNode,
        style: {
          ...baseNode.style,
          border: "1px solid rgba(255,255,255,0.20)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
        },
      },
      {
        id: "d2",
        position: { x: 40, y: 230 },
        data: { label: "휴가 일정\n(부재 기간/동선)" },
        ...baseNode,
        style: {
          ...baseNode.style,
          border: "1px solid rgba(255,255,255,0.22)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
        },
      },
      {
        id: "d3",
        position: { x: 40, y: 390 },
        data: { label: "자녀 이름\n(학교/학원 단서)" },
        ...baseNode,
        style: {
          ...baseNode.style,
          border: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.35))",
        },
      },
      {
        id: "r1",
        position: { x: 360, y: 135 },
        data: { label: "위험 요소\n빈집 시간대 추정" },
        ...baseNode,
        style: {
          ...baseNode.style,
          border: "1px solid rgba(255,255,255,0.34)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.35))",
        },
      },
      {
        id: "r2",
        position: { x: 360, y: 330 },
        data: { label: "위험 요소\n가족정보 기반 피싱" },
        ...baseNode,
        style: {
          ...baseNode.style,
          border: "1px solid rgba(255,255,255,0.44)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.35))",
        },
      },
      {
        id: "s1",
        position: { x: 690, y: 220 },
        data: { label: "범죄 시나리오\n(보이스피싱/빈집털이)" },
        ...baseNode,
        style: {
          ...baseNode.style,
          width: 260,
          border: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.40))",
        },
      },
    ],
    [],
  );

  const edges = useMemo<Edge[]>(
    () => [
      {
        id: "e-d1-r1",
        source: "d1",
        target: "r1",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(255,255,255,0.70)" },
        style: { stroke: "rgba(255,255,255,0.70)", strokeWidth: 2, strokeDasharray: "6 6" },
      },
      {
        id: "e-d2-r1",
        source: "d2",
        target: "r1",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(255,255,255,0.65)" },
        style: { stroke: "rgba(255,255,255,0.65)", strokeWidth: 2, strokeDasharray: "6 6" },
      },
      {
        id: "e-d3-r2",
        source: "d3",
        target: "r2",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(255,255,255,0.55)" },
        style: { stroke: "rgba(255,255,255,0.55)", strokeWidth: 2, strokeDasharray: "6 6" },
      },
      {
        id: "e-r1-s1",
        source: "r1",
        target: "s1",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(255,255,255,0.82)" },
        style: { stroke: "rgba(255,255,255,0.82)", strokeWidth: 2.2 },
      },
      {
        id: "e-r2-s1",
        source: "r2",
        target: "s1",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "rgba(255,255,255,0.88)" },
        style: { stroke: "rgba(255,255,255,0.88)", strokeWidth: 2.2 },
      },
    ],
    [],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
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
  );
}
