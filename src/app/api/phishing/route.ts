import { NextResponse } from "next/server";
import { getRetryAfterMs } from "@/lib/rateLimit";
import type { BlindReport, ImageFinding, RiskNode, Scenario } from "@/lib/types";
import { requireOwnershipOrThrow } from "@/lib/ownership/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowISO() {
  return new Date().toISOString();
}

function maskDigits(s: string) {
  return s.replace(/\d{6,}/g, (m) => `${m.slice(0, 2)}***${m.slice(-2)}`);
}

function stripUrls(s: string) {
  return s.replace(/https?:\/\/\S+/gi, "[링크 생략]");
}

function sanitizeOutput(s: string) {
  return maskDigits(stripUrls(s)).trim();
}

function stripCodeFences(s: string) {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
}

function removeTrailingCommas(s: string) {
  return s.replace(/,\s*([}\]])/g, "$1");
}

function normalizeJsonText(s: string) {
  return removeTrailingCommas(stripCodeFences(s)).trim();
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

async function callOpenAIPhishing(opts: {
  apiKey: string;
  model: string;
  blogId: string;
  extractedPieces: BlindReport["extractedPieces"];
  imageFindings: ImageFinding[];
  riskNodes: RiskNode[];
  scenarios: Scenario[];
}) {
  const system = [
    "너는 보안 인식 훈련용 시뮬레이터다. 목표는 사용자가 '왜 속을 수 있는지'를 체감하게 하는 것이다.",
    "",
    "중요 안전 규칙:",
    "- 실제 피싱/범죄를 돕는 구체적 실행 지침은 절대 제공하지 마라.",
    "- 링크(URL), 전화번호, 계좌번호, 기관/은행/경찰 등 실제 권위기관 사칭 디테일, 송금/인증 유도는 금지.",
    "- 본문에는 실제 개인정보(주소/연락처/주문번호 등)를 그대로 쓰지 말고, 필요하면 [동네], [지인], [회사], [매장], [일정] 같은 플레이스홀더로 표시해라.",
    "- 출력은 반드시 JSON만(설명/코드펜스 금지). JSON.parse 가능한 엄격한 JSON이어야 한다.",
    "",
    "출력 스키마:",
    "{",
    '  "sms": string,',
    '  "voiceScript": string',
    "}",
    "",
    "작성 가이드:",
    "- 한국어로 작성하되, 결과물은 '보안 공지/주의문'이 아니라 '공격자가 보낸 것처럼 보이는 유인 메시지' 톤이어야 한다.",
    "- 사용자가 공개한 단서(extractedPieces/imageFindings)에서 최소 2개 맥락(장소/일정/관계/소속)을 반영해 개인화해라.",
    "- sms는 220자 이내. 구조: 신뢰 훅 1문장 + 가벼운 긴급성 1문장 + 작은 행동 요청 1문장.",
    "- voiceScript는 12~18줄, 각 줄을 '공격자:' 또는 '사용자:'로 시작하는 대화형 대본으로 작성해라.",
    "- '주의 바랍니다', '보안 경고', '즉시 차단', '공식 채널 확인' 같은 순수 안내문 문체를 본문 대부분으로 쓰지 마라.",
    "- 마지막 줄에만 '[훈련 안내]' 접두어로 방어 팁 1줄을 넣어라.",
  ].join("\n");

  const payload = {
    blogId: opts.blogId,
    signals: {
      extractedPieces: opts.extractedPieces.slice(0, 24).map((p) => ({
        type: p.type,
        value: p.value.slice(0, 120),
        evidence: p.evidence
          ? {
              excerpt: p.evidence.excerpt.slice(0, 160),
              rationale: p.evidence.rationale.slice(0, 180),
              confidence: p.evidence.confidence ?? null,
            }
          : null,
      })),
      imageFindings: opts.imageFindings.slice(0, 16).map((f) => ({
        label: f.label.slice(0, 80),
        severity: f.severity,
        excerpt: f.excerpt.slice(0, 160),
        rationale: f.rationale.slice(0, 180),
        confidence: f.confidence ?? null,
      })),
      riskNodes: opts.riskNodes.slice(0, 8),
      scenarios: opts.scenarios.slice(0, 6),
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      max_tokens: 700,
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

  const model = process.env.OPENAI_PHISHING_MODEL || "gpt-5";

  const body = (await req.json().catch(() => null)) as
    | {
        blogId?: unknown;
        extractedPieces?: unknown;
        imageFindings?: unknown;
        riskNodes?: unknown;
        scenarios?: unknown;
      }
    | null;

  const blogId = typeof body?.blogId === "string" ? body.blogId.trim() : "";
  if (!blogId) return NextResponse.json({ error: "blogId is required" }, { status: 400 });

  const denied = requireOwnershipOrThrow(req, blogId);
  if (denied) return denied;

  const extractedPieces = Array.isArray(body?.extractedPieces)
    ? ((body!.extractedPieces as BlindReport["extractedPieces"]).slice(0, 60) as BlindReport["extractedPieces"])
    : [];
  const imageFindings = Array.isArray(body?.imageFindings)
    ? ((body!.imageFindings as ImageFinding[]).slice(0, 60) as ImageFinding[])
    : [];
  const riskNodes = Array.isArray(body?.riskNodes) ? (body!.riskNodes as RiskNode[]) : [];
  const scenarios = Array.isArray(body?.scenarios) ? (body!.scenarios as Scenario[]) : [];

  const res = await callOpenAIPhishing({
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
        { error: "openai_phishing_429", retryAfterMs },
        { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }
    return NextResponse.json(
      { error: `openai_phishing_${res.status}`, details: text.slice(0, 240) },
      { status: 502 },
    );
  }

  let extracted: Record<string, unknown>;
  try {
    extracted = extractJsonObjectFromChatCompletions(text);
  } catch (e) {
    return NextResponse.json(
      { error: "openai_phishing_parse_failed", details: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }

  const smsRaw = typeof extracted.sms === "string" ? extracted.sms : "";
  const voiceRaw = typeof extracted.voiceScript === "string" ? extracted.voiceScript : "";
  if (!smsRaw || !voiceRaw) {
    return NextResponse.json({ error: "phishing_invalid_output" }, { status: 502 });
  }

  return NextResponse.json(
    {
      sms: sanitizeOutput(smsRaw).slice(0, 500),
      voiceScript: sanitizeOutput(voiceRaw).slice(0, 2000),
      model,
      generatedAt: nowISO(),
    },
    { status: 200 },
  );
}
