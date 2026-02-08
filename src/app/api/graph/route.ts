import { NextResponse } from "next/server";
import { getRetryAfterMs } from "@/lib/rateLimit";
import type {
  AttackGraph,
  AttackGraphEdge,
  BlindReport,
  ImageFinding,
  RiskNode,
  Scenario,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowISO() {
  return new Date().toISOString();
}

function stripCodeFences(s: string) {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
}

function removeTrailingCommas(s: string) {
  return s.replace(/,\s*([}\]])/g, "$1");
}

function removeJsonComments(s: string) {
  return s
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function fixMissingCommasBetweenObjects(s: string) {
  return s.replace(/}\s*{/g, "},{");
}

function normalizeJsonText(s: string) {
  return fixMissingCommasBetweenObjects(
    removeTrailingCommas(removeJsonComments(stripCodeFences(s))),
  ).trim();
}

function jsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const attempt = (raw: string) => JSON.parse(normalizeJsonText(raw));

  try {
    return attempt(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return attempt(trimmed.slice(start, end + 1));
    throw new Error("invalid_json");
  }
}

function extractJsonObjectFromChatCompletions(text: string): Record<string, unknown> {
  const outer = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = outer.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("openai_empty_content");
  return jsonFromText(content) as Record<string, unknown>;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

function sanitizeEdges(opts: {
  edgesRaw: unknown;
  pieceCount: number;
  imageFindingCount: number;
  riskIds: Set<string>;
  scenarioIds: Set<string>;
}): AttackGraphEdge[] {
  const arr = Array.isArray(opts.edgesRaw) ? opts.edgesRaw : [];
  const out: AttackGraphEdge[] = [];

  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!isRecord(e)) continue;
    const id = typeof e.id === "string" && e.id.trim() ? e.id : `e-${i + 1}`;
    const strength =
      typeof e.strength === "number" && Number.isFinite(e.strength)
        ? clamp(e.strength, 0, 1)
        : 0.5;
    const reason = typeof e.reason === "string" ? e.reason.trim() : "";
    if (!reason) continue;

    const source = isRecord(e.source) ? e.source : null;
    const target = isRecord(e.target) ? e.target : null;
    if (!source || !target) continue;

    const sKind = typeof source.kind === "string" ? source.kind : "";
    const tKind = typeof target.kind === "string" ? target.kind : "";

    let src:
      | { kind: "piece"; index: number }
      | { kind: "image"; index: number }
      | { kind: "risk"; riskId: string }
      | null = null;

    if (sKind === "piece") {
      const idx = typeof source.index === "number" ? Math.floor(source.index) : -1;
      if (idx >= 0 && idx < opts.pieceCount) src = { kind: "piece", index: idx };
    } else if (sKind === "image") {
      const idx = typeof source.index === "number" ? Math.floor(source.index) : -1;
      if (idx >= 0 && idx < opts.imageFindingCount) src = { kind: "image", index: idx };
    } else if (sKind === "risk") {
      const riskId = typeof source.riskId === "string" ? source.riskId : "";
      if (riskId && opts.riskIds.has(riskId)) src = { kind: "risk", riskId };
    }

    let dst: { kind: "risk"; riskId: string } | { kind: "scenario"; scenarioId: string } | null =
      null;
    if (tKind === "risk") {
      const riskId = typeof target.riskId === "string" ? target.riskId : "";
      if (riskId && opts.riskIds.has(riskId)) dst = { kind: "risk", riskId };
    } else if (tKind === "scenario") {
      const scenarioId = typeof target.scenarioId === "string" ? target.scenarioId : "";
      if (scenarioId && opts.scenarioIds.has(scenarioId)) dst = { kind: "scenario", scenarioId };
    }

    if (!src || !dst) continue;

    out.push({
      id,
      source: src,
      target: dst,
      strength,
      reason,
    });
  }

  // Deduplicate by source->target, keep highest strength.
  const best = new Map<string, AttackGraphEdge>();
  for (const e of out) {
    const sk =
      e.source.kind === "piece"
        ? `piece:${e.source.index}`
        : e.source.kind === "image"
          ? `image:${e.source.index}`
          : `risk:${e.source.riskId}`;
    const tk = e.target.kind === "risk" ? `risk:${e.target.riskId}` : `scenario:${e.target.scenarioId}`;
    const k = `${sk}=>${tk}`;
    const prev = best.get(k);
    if (!prev || e.strength > prev.strength) best.set(k, e);
  }

  return Array.from(best.values()).slice(0, 200);
}

async function callOpenAIGraph(opts: {
  apiKey: string;
  model: string;
  blogId: string;
  extractedPieces: BlindReport["extractedPieces"];
  imageFindings: ImageFinding[];
  riskNodes: RiskNode[];
  scenarios: Scenario[];
}) {
  const pieceCount = opts.extractedPieces.length;
  const imageFindingCount = opts.imageFindings.length;

  const system = [
    "너는 OSINT 기반 개인정보 노출을 '방어 목적'으로 시각화하는 보안 분석가다.",
    "입력으로 제공되는 piece(텍스트 단서), imageFinding(이미지 단서), riskNodes(위험 요소), scenarios(공격 시나리오)를 연결하는 그래프 엣지를 생성해라.",
    "",
    "중요 안전 규칙:",
    "- 실제 범죄를 돕는 구체적 실행 지침(침입 방법, 회피 방법, 표적화 절차)은 절대 제공하지 마라.",
    "- reason은 경각심/방어 관점으로만 작성해라.",
    "",
    "출력은 반드시 JSON만(설명/코드펜스 금지)이며 JSON.parse 가능한 '엄격한 JSON'이어야 한다.",
    "",
    "출력 스키마:",
    "{",
    '  "edges": [{',
    '    "id": string,',
    '    "source": { "kind": "piece"|"image"|"risk", "index"?: number, "riskId"?: string },',
    '    "target": { "kind": "risk"|"scenario", "riskId"?: string, "scenarioId"?: string },',
    '    "strength": number,',
    '    "reason": string',
    "  }],",
    '  "warnings"?: string[]',
    "}",
    "",
    "규칙:",
    "- piece->risk 엣지는 piece마다 1~2개만 생성해라.",
    "- image->risk 엣지는 imageFinding마다 1개만 생성해라.",
    "- risk->scenario 엣지는 scenario마다 1개만 생성해라.",
    "- 존재하지 않는 index/ID를 참조하지 마라.",
    `- piece index 범위: 0..${Math.max(0, pieceCount - 1)}`,
    `- image index 범위: 0..${Math.max(0, imageFindingCount - 1)}`,
    "- strength는 0~1로 정규화해라(확신이 높을수록 큼).",
    "- reason은 1~2문장, 140자 이내.",
  ].join("\n");

  const payload = {
    blogId: opts.blogId,
    extractedPieces: opts.extractedPieces.map((p, idx) => ({
      index: idx,
      type: p.type,
      value: p.value.slice(0, 140),
      evidence: p.evidence
        ? {
            logNo: p.evidence.logNo ?? "",
            excerpt: p.evidence.excerpt.slice(0, 180),
            rationale: p.evidence.rationale.slice(0, 220),
            confidence: p.evidence.confidence ?? null,
          }
        : null,
    })),
    imageFindings: opts.imageFindings.map((f, idx) => ({
      index: idx,
      postLogNo: f.postLogNo,
      imageIndex: f.imageIndex,
      label: f.label.slice(0, 80),
      severity: f.severity,
      excerpt: f.excerpt.slice(0, 180),
      rationale: f.rationale.slice(0, 220),
      confidence: f.confidence ?? null,
    })),
    riskNodes: opts.riskNodes,
    scenarios: opts.scenarios,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  return res;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }

  const model = process.env.OPENAI_GRAPH_MODEL || "gpt-4o-mini";

  const body = (await req.json().catch(() => null)) as
    | {
        blogId?: unknown;
        extractedPieces?: unknown;
        extractedPieceIndexes?: unknown;
        imageFindings?: unknown;
        imageFindingIndexes?: unknown;
        riskNodes?: unknown;
        scenarios?: unknown;
      }
    | null;

  const blogId = typeof body?.blogId === "string" ? body.blogId.trim() : "";
  if (!blogId) return NextResponse.json({ error: "blogId is required" }, { status: 400 });

  // Bound inputs to keep prompts predictable (cost/latency) and reduce failure risk.
  const extractedPieces = Array.isArray(body?.extractedPieces)
    ? ((body!.extractedPieces as BlindReport["extractedPieces"]).slice(0, 40) as BlindReport["extractedPieces"])
    : [];
  const extractedPieceIndexesRaw = Array.isArray(body?.extractedPieceIndexes)
    ? (body!.extractedPieceIndexes as unknown[])
    : null;
  const extractedPieceIndexes =
    extractedPieceIndexesRaw && extractedPieceIndexesRaw.length >= extractedPieces.length
      ? extractedPieceIndexesRaw
          .slice(0, extractedPieces.length)
          .map((x, i) =>
            typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : i,
          )
      : extractedPieces.map((_, i) => i);

  const imageFindings = Array.isArray(body?.imageFindings)
    ? ((body!.imageFindings as ImageFinding[]).slice(0, 40) as ImageFinding[])
    : [];
  const imageFindingIndexesRaw = Array.isArray(body?.imageFindingIndexes)
    ? (body!.imageFindingIndexes as unknown[])
    : null;
  const imageFindingIndexes =
    imageFindingIndexesRaw && imageFindingIndexesRaw.length >= imageFindings.length
      ? imageFindingIndexesRaw
          .slice(0, imageFindings.length)
          .map((x, i) =>
            typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : i,
          )
      : imageFindings.map((_, i) => i);
  const riskNodes = Array.isArray(body?.riskNodes)
    ? ((body!.riskNodes as RiskNode[]).slice(0, 20) as RiskNode[])
    : [];
  const scenarios = Array.isArray(body?.scenarios)
    ? ((body!.scenarios as Scenario[]).slice(0, 12) as Scenario[])
    : [];

  const riskIds = new Set(riskNodes.map((r) => r.id));
  const scenarioIds = new Set(scenarios.map((s) => s.id));

  const res = await callOpenAIGraph({
    apiKey,
    model,
    blogId,
    extractedPieces,
    imageFindings,
    riskNodes,
    scenarios,
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfterMs = getRetryAfterMs(res.headers, 8000);
      return NextResponse.json(
        { error: "openai_graph_429", retryAfterMs },
        { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }
    return NextResponse.json(
      { error: `openai_graph_${res.status}`, details: text.slice(0, 240) },
      { status: 502 },
    );
  }

  let extracted: Record<string, unknown>;
  try {
    extracted = extractJsonObjectFromChatCompletions(text);
  } catch (e) {
    return NextResponse.json(
      { error: "openai_graph_parse_failed", details: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }

  const edges = sanitizeEdges({
    edgesRaw: extracted.edges,
    pieceCount: extractedPieces.length,
    imageFindingCount: imageFindings.length,
    riskIds,
    scenarioIds,
  });

  // If the caller provided index maps (subset -> original), translate indices back to the original report arrays.
  const mappedEdges: AttackGraphEdge[] = edges
    .map((e) => {
      if (e.source.kind === "piece") {
        const mapped = extractedPieceIndexes[e.source.index];
        if (typeof mapped !== "number") return null;
        return { ...e, source: { kind: "piece", index: mapped } };
      }
      if (e.source.kind === "image") {
        const mapped = imageFindingIndexes[e.source.index];
        if (typeof mapped !== "number") return null;
        return { ...e, source: { kind: "image", index: mapped } };
      }
      return e;
    })
    .filter(Boolean) as AttackGraphEdge[];
  const warnings = Array.isArray(extracted.warnings)
    ? (extracted.warnings.filter((x) => typeof x === "string") as string[])
    : undefined;

  const out: AttackGraph = {
    generatedAt: nowISO(),
    model,
    edges: mappedEdges,
    warnings: warnings?.slice(0, 10),
  };

  return NextResponse.json(out, { status: 200 });
}
