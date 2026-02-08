"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { BlindReport, Scenario } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Tag from "@/components/ui/Tag";

type Inspect =
  | { kind: "edge"; reason: string; strength?: number }
  | { kind: "scenario"; scenario: Scenario }
  | null;

type Filters = {
  showPieces: boolean;
  showImages: boolean;
  showRisks: boolean;
  showScenarios: boolean;
  highOnly: boolean;
};

type ViewMode = "summary" | "full";

const AttackPathGraph = dynamic(() => import("@/components/report/AttackPathGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-300">
      그래프 로딩 중…
    </div>
  ),
});

export default function GraphPanel(props: {
  report: BlindReport;
  onSelectPiece: (pieceIndex: number) => void;
  onSelectImageFinding: (findingIndex: number) => void;
}) {
  const { report, onSelectPiece, onSelectImageFinding } = props;
  const [inspect, setInspect] = useState<Inspect>(null);

  const [filters, setFilters] = useState<Filters>({
    showPieces: true,
    showImages: true,
    showRisks: true,
    showScenarios: true,
    highOnly: false,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("summary");

  const edgesCount = report.attackGraph?.edges?.length ?? 0;
  const llmActive = Boolean(edgesCount);

  const filterChips = useMemo(
    () => [
      {
        key: "showPieces" as const,
        label: "텍스트",
      },
      {
        key: "showImages" as const,
        label: "이미지",
      },
      {
        key: "showRisks" as const,
        label: "Risk",
      },
      {
        key: "showScenarios" as const,
        label: "Scenario",
      },
    ],
    [],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <Card className="p-4 sm:p-5" variant="surface2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Attack Path Graph</div>
              <div className="mt-1 text-xs text-zinc-400">
                {llmActive ? (
                  <>
                    <Tag tone="ok">LLM edges</Tag>{" "}
                    <span className="font-mono text-zinc-300">edge {edgesCount}개</span>
                  </>
                ) : (
                  <span>휴리스틱 그래프(LLM 미적용)</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((c) => (
                <Button
                  key={c.key}
                  size="sm"
                  variant={filters[c.key] ? "secondary" : "ghost"}
                  onClick={() =>
                    setFilters((p) => ({ ...p, [c.key]: !p[c.key] }))
                  }
                >
                  {c.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant={viewMode === "summary" ? "secondary" : "ghost"}
                onClick={() => setViewMode((p) => (p === "summary" ? "full" : "summary"))}
                title="요약 그래프는 반복 단서/저강도 연결을 줄여 더 논리적으로 보이도록 합니다."
              >
                {viewMode === "summary" ? "요약" : "전체"}
              </Button>
              <Button
                size="sm"
                variant={filters.highOnly ? "secondary" : "ghost"}
                onClick={() => setFilters((p) => ({ ...p, highOnly: !p.highOnly }))}
                title="high severity 중심으로 간단히 봅니다."
              >
                high만
              </Button>
            </div>
          </div>

          <div className="mt-4 h-[560px] overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <AttackPathGraph
              report={report}
              onSelectPiece={onSelectPiece}
              onSelectImageFinding={onSelectImageFinding}
              filters={filters}
              viewMode={viewMode}
              onInspectChange={setInspect}
            />
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <div className="space-y-4">
          <Card className="p-4" variant="surface1">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">선택된 항목</div>
              <Button size="sm" variant="ghost" onClick={() => setInspect(null)}>
                초기화
              </Button>
            </div>

            {inspect?.kind === "edge" ? (
              <div className="mt-3">
                <div className="text-xs text-zinc-400">엣지 근거</div>
                <div className="mt-1 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-200">
                  {inspect.reason}
                </div>
                {typeof inspect.strength === "number" ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    strength:{" "}
                    <span className="font-mono text-zinc-200">
                      {Math.round(inspect.strength * 100)}%
                    </span>
                  </div>
                ) : null}
              </div>
            ) : inspect?.kind === "scenario" ? (
              <div className="mt-3">
                <div className="text-xs text-zinc-400">시나리오</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {inspect.scenario.title}
                </div>
                <div className="mt-2 text-sm leading-6 text-zinc-300">
                  {inspect.scenario.narrative}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                노드 또는 엣지를 클릭하면 근거/시나리오를 여기에서 확인할 수 있어요.
              </div>
            )}
          </Card>

          <Card className="p-4" variant="surface1">
            <div className="text-sm font-semibold text-white">팁</div>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              <li>• 엣지를 클릭하면 “왜 연결되는지” 근거가 표시됩니다.</li>
              <li>• Scenario를 클릭하면 최종 공격 시나리오 설명을 봅니다.</li>
              <li>• Evidence 탭에서 원문 발췌/이미지 미리보기로 바로 이동할 수 있어요.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
