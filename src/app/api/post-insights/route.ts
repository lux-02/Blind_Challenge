import { NextResponse } from "next/server";
import { getRetryAfterMs } from "@/lib/rateLimit";
import type { ExtractedPiece, ImageFinding, PostInsight, PostInsights } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowISO() {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stripCodeFences(s: string) {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
}

function removeTrailingCommas(s: string) {
  return s.replace(/,\s*([}\]])/g, "$1");
}

function removeJsonComments(s: string) {
  return s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
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
  const obj = jsonFromText(content);
  if (!isRecord(obj)) throw new Error("openai_invalid_json_object");
  return obj;
}

function sanitizePostInsight(v: unknown): PostInsight | null {
  const o = isRecord(v) ? v : null;
  if (!o) return null;

  const logNo = typeof o.logNo === "string" ? o.logNo.trim() : "";
  if (!logNo) return null;

  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const riskSignals = asArray<unknown>(o.riskSignals)
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);

  const evidence = asArray<unknown>(o.evidence)
    .map((x) => (isRecord(x) ? x : null))
    .filter(Boolean)
    .map((e) => {
      const kindRaw = typeof e!.kind === "string" ? e!.kind : "text";
      const kind = kindRaw === "image" ? "image" : "text";
      const excerpt = typeof e!.excerpt === "string" ? e!.excerpt.trim() : "";
      const why = typeof e!.why === "string" ? e!.why.trim() : "";
      const sevRaw = typeof e!.severity === "string" ? e!.severity : "low";
      const severity = (["low", "medium", "high"] as const).includes(sevRaw as never)
        ? (sevRaw as "low" | "medium" | "high")
        : "low";
      const confidence =
        typeof e!.confidence === "number" && Number.isFinite(e!.confidence)
          ? clamp(e!.confidence, 0, 1)
          : undefined;
      if (!excerpt || !why) return null;
      return { kind, excerpt: excerpt.slice(0, 200), why: why.slice(0, 160), severity, confidence };
    })
    .filter(Boolean)
    .slice(0, 14) as PostInsight["evidence"];

  const defensiveActions = asArray<unknown>(o.defensiveActions)
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);

  if (!summary) return null;

  return {
    logNo,
    summary: summary.slice(0, 900),
    riskSignals,
    evidence,
    defensiveActions,
  };
}

async function callOpenAI(opts: {
  apiKey: string;
  model: string;
  blogId: string;
  posts: Array<{
    logNo: string;
    title: string;
    url: string;
    publishedAt?: string;
    categoryName?: string;
    textEvidence: Array<{
      type: ExtractedPiece["type"];
      value: string;
      excerpt: string;
      rationale: string;
      confidence?: number;
    }>;
    imageEvidence: Array<{
      label: string;
      severity: ImageFinding["severity"];
      excerpt: string;
      rationale: string;
      confidence?: number;
    }>;
  }>;
}) {
  const system = [
    "너는 OSINT 기반 개인정보/생활패턴 노출을 '방어 목적'으로 해석하는 보안 분석가다.",
    "각 포스트에 대해 텍스트 단서(excerpt)와 이미지 단서(excerpt)를 종합해 'AI 통합 분석'을 작성한다.",
    "",
    "중요 규칙:",
    "- 반드시 한국어로만 작성해라(영어 금지).",
    "- 입력 evidence에 없는 내용은 단정하지 말고, 가능성을 과장하지 마라.",
    "- 실제 범죄를 돕는 구체적 실행 지침(침입 방법, 회피 방법, 표적화 절차, 불법 행위 단계)은 절대 제공하지 마라.",
    "- 출력은 반드시 JSON만(설명/코드펜스 금지), JSON.parse 가능한 엄격한 JSON이어야 한다.",
    "",
    "출력(JSON) 스키마:",
    "{",
    '  "posts": [{',
    '    "logNo": string,',
    '    "summary": string,',
    '    "riskSignals": string[],',
    '    "evidence": [{ "kind": "text"|"image", "excerpt": string, "why": string, "severity": "low"|"medium"|"high", "confidence": number }],',
    '    "defensiveActions": string[]',
    "  }]",
    "}",
    "",
    "요청:",
    "- summary는 3~5문장.",
    "- riskSignals는 3~6개 짧은 라벨.",
    "- evidence는 입력 excerpt를 기반으로만 작성(마스킹 유지).",
    "- defensiveActions는 3~5개(바로 적용 가능한 조치).",
  ].join("\n");

  const payload = {
    blogId: opts.blogId,
    posts: opts.posts.map((p) => ({
      logNo: p.logNo,
      title: p.title,
      url: p.url,
      publishedAt: p.publishedAt ?? "",
      categoryName: p.categoryName ?? "",
      textEvidence: p.textEvidence.slice(0, 10),
      imageEvidence: p.imageEvidence.slice(0, 10),
    })),
  };

  const baseBody: Record<string, unknown> = {
    model: opts.model,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
  };

  const bodies: Array<Record<string, unknown>> = [
    { ...baseBody, response_format: { type: "json_object" } },
    baseBody,
  ];

  let lastErr: Error | null = null;
  for (const body of bodies) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return res;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("openai_error");
    }
  }
  throw lastErr ?? new Error("openai_error");
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        blogId?: unknown;
        contents?: unknown;
        extractedPieces?: unknown;
        imageFindings?: unknown;
      }
    | null;

  const blogId = typeof body?.blogId === "string" ? body.blogId.trim() : "";
  if (!blogId) return NextResponse.json({ error: "blogId is required" }, { status: 400 });

  const contentsRaw = Array.isArray(body?.contents) ? body!.contents : [];
  const contents = contentsRaw
    .map((x) => (isRecord(x) ? x : null))
    .filter(Boolean)
    .map((c) => ({
      logNo: typeof c!.logNo === "string" ? c!.logNo : "",
      url: typeof c!.url === "string" ? c!.url : "",
      title: typeof c!.title === "string" ? c!.title : "",
      publishedAt: typeof c!.publishedAt === "string" ? c!.publishedAt : undefined,
      categoryName: typeof c!.categoryName === "string" ? c!.categoryName : undefined,
    }))
    .filter((c) => c.logNo && c.url && c.title);

  if (!contents.length) {
    return NextResponse.json({ error: "contents is required" }, { status: 400 });
  }

  const piecesRaw = Array.isArray(body?.extractedPieces) ? body!.extractedPieces : [];
  const pieces = piecesRaw
    .map((x) => (isRecord(x) ? x : null))
    .filter(Boolean)
    .map((p) => {
      const evidence = isRecord(p!.evidence) ? p!.evidence : null;
      return {
        type: typeof p!.type === "string" ? (p!.type as ExtractedPiece["type"]) : "other",
        value: typeof p!.value === "string" ? p!.value : "",
        evidence: evidence
          ? {
              logNo: typeof evidence.logNo === "string" ? evidence.logNo : "",
              excerpt: typeof evidence.excerpt === "string" ? evidence.excerpt : "",
              rationale: typeof evidence.rationale === "string" ? evidence.rationale : "",
              confidence:
                typeof evidence.confidence === "number" && Number.isFinite(evidence.confidence)
                  ? clamp(evidence.confidence, 0, 1)
                  : undefined,
            }
          : null,
      };
    })
    .filter((p) => p.value && p.evidence?.logNo);

  const findingsRaw = Array.isArray(body?.imageFindings) ? body!.imageFindings : [];
  const imageFindings = findingsRaw
    .map((x) => (isRecord(x) ? x : null))
    .filter(Boolean)
    .map((f) => ({
      postLogNo: typeof f!.postLogNo === "string" ? f!.postLogNo : "",
      label: typeof f!.label === "string" ? f!.label : "",
      severity:
        typeof f!.severity === "string" && (["low", "medium", "high"] as const).includes(f!.severity as never)
          ? (f!.severity as ImageFinding["severity"])
          : "low",
      excerpt: typeof f!.excerpt === "string" ? f!.excerpt : "",
      rationale: typeof f!.rationale === "string" ? f!.rationale : "",
      confidence:
        typeof f!.confidence === "number" && Number.isFinite(f!.confidence)
          ? clamp(f!.confidence, 0, 1)
          : undefined,
    }))
    .filter((f) => f.postLogNo && f.label && f.excerpt && f.rationale);

  const piecesByLogNo = new Map<string, typeof pieces>();
  for (const p of pieces) {
    const logNo = p.evidence?.logNo;
    if (!logNo) continue;
    const list = piecesByLogNo.get(logNo) ?? [];
    list.push(p);
    piecesByLogNo.set(logNo, list);
  }

  const findingsByLogNo = new Map<string, typeof imageFindings>();
  for (const f of imageFindings) {
    const list = findingsByLogNo.get(f.postLogNo) ?? [];
    list.push(f);
    findingsByLogNo.set(f.postLogNo, list);
  }

  const model = process.env.OPENAI_POST_INSIGHTS_MODEL || "gpt-4o-mini";
  const res = await callOpenAI({
    apiKey,
    model,
    blogId,
    posts: contents.map((c) => ({
      ...c,
      textEvidence: (piecesByLogNo.get(c.logNo) ?? [])
        .slice(0, 10)
        .map((p) => ({
          type: p.type,
          value: p.value.slice(0, 140),
          excerpt: p.evidence?.excerpt.slice(0, 200) ?? "",
          rationale: p.evidence?.rationale.slice(0, 220) ?? "",
          confidence: p.evidence?.confidence,
        }))
        .filter((x) => x.excerpt && x.rationale),
      imageEvidence: (findingsByLogNo.get(c.logNo) ?? []).slice(0, 10).map((f) => ({
        label: f.label.slice(0, 100),
        severity: f.severity,
        excerpt: f.excerpt.slice(0, 200),
        rationale: f.rationale.slice(0, 220),
        confidence: f.confidence,
      })),
    })),
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfterMs = getRetryAfterMs(res.headers, 8000);
      return NextResponse.json(
        { error: "openai_post_insights_429", retryAfterMs },
        { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }
    return NextResponse.json(
      { error: `openai_post_insights_${res.status}`, details: txt.slice(0, 240) },
      { status: 502 },
    );
  }

  let obj: Record<string, unknown>;
  try {
    obj = extractJsonObjectFromChatCompletions(txt);
  } catch (e) {
    return NextResponse.json(
      { error: "openai_post_insights_parse_failed", details: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }

  const items = Array.isArray(obj.posts) ? obj.posts : [];
  const postsOut = items.map(sanitizePostInsight).filter(Boolean) as PostInsight[];

  const insights: PostInsights = {
    generatedAt: nowISO(),
    model,
    posts: postsOut,
    warnings: [],
  };

  // If model output is incomplete, keep a warning but still return the partial result.
  const missing = contents.filter((c) => !postsOut.some((p) => p.logNo === c.logNo)).length;
  if (missing > 0) {
    insights.warnings = [`일부 포스트 통합 분석이 누락될 수 있어요: ${missing}개`];
  }

  return NextResponse.json(insights, { status: 200 });
}

