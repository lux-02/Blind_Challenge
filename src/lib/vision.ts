import type { CookieSession } from "@/lib/naver/mblogScraper";

function stripCodeFences(s: string) {
  // Handles ```json ... ``` and ``` ... ``` wrappers.
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
}

function removeTrailingCommas(s: string) {
  // Allow a common "almost-JSON" mistake: trailing commas in arrays/objects.
  return s.replace(/,\s*([}\]])/g, "$1");
}

function removeJsonComments(s: string) {
  // Best-effort: remove JS-style comments that models sometimes emit.
  // This is not a full lexer; it assumes comments appear outside strings.
  return s
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function fixMissingCommasBetweenObjects(s: string) {
  // Common model mistake in arrays: `[ {..} {..} ]` (missing comma)
  // Heuristic: insert comma between adjacent object literals.
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
    // Best-effort: extract first JSON object.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return attempt(slice);
      } catch {
        // Last resort: try to salvage a findings array even if commas are missing.
        const salvaged = salvageFindingsOnly(slice);
        if (salvaged) return salvaged;
      }
    }
    throw new Error("invalid_json");
  }
}

export function extractJsonObjectFromChatCompletions(text: string): Record<string, unknown> {
  const outer = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = outer.choices?.[0]?.message?.content ?? "";
  if (!content || typeof content !== "string") {
    throw new Error("openai_empty_content");
  }
  return jsonFromText(content) as Record<string, unknown>;
}

function findMatchingBracket(s: string, openPos: number, openChar: "[" | "{", closeChar: "]" | "}"): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openPos; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractObjectChunksFromArrayText(arrayInner: string): string[] {
  const chunks: string[] = [];
  let inStr = false;
  let esc = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < arrayInner.length; i++) {
    const ch = arrayInner[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        chunks.push(arrayInner.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return chunks;
}

function salvageFindingsOnly(jsonObjectLike: string): Record<string, unknown> | null {
  const hay = normalizeJsonText(jsonObjectLike);
  const keyPos = hay.indexOf("\"findings\"");
  if (keyPos < 0) return null;

  const arrOpen = hay.indexOf("[", keyPos);
  if (arrOpen < 0) return null;
  const arrClose = findMatchingBracket(hay, arrOpen, "[", "]");
  // If the model output is truncated, `]` may be missing. Salvage what we can.
  const inner = arrClose < 0 ? hay.slice(arrOpen + 1) : hay.slice(arrOpen + 1, arrClose);
  const chunks = extractObjectChunksFromArrayText(inner);
  if (!chunks.length) return null;

  const findings: unknown[] = [];
  for (const c of chunks) {
    try {
      findings.push(JSON.parse(normalizeJsonText(c)));
    } catch {
      // Skip unparsable chunk.
    }
  }

  if (!findings.length) return null;
  return { findings };
}

function pickContentTypeFromUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

export function maskDigits(s: string) {
  // Mask long digit sequences to avoid leaking exact identifiers in UI/logs.
  return s.replace(/\d{6,}/g, (m) => `${m.slice(0, 2)}***${m.slice(-2)}`);
}

export function isAllowedRemoteImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();

    // Allowlist: Naver static image hosts (SSRF mitigation).
    if (host.endsWith(".pstatic.net")) return true;
    if (host === "blogfiles.pstatic.net") return true;
    if (host === "postfiles.pstatic.net") return true;
    if (host === "phinf.pstatic.net") return true;
    if (host === "ssl.pstatic.net") return true;
    return false;
  } catch {
    return false;
  }
}

export async function fetchImageAsDataUrl(opts: {
  url: string;
  session: CookieSession;
  referer: string;
  maxBytes: number;
}) {
  const res = await fetch(opts.url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      referer: opts.referer,
      cookie: opts.session.cookie,
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`image_fetch_failed_${res.status}`);
  }

  const lenHeader = res.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > opts.maxBytes) {
    throw new Error("image_too_large");
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength > opts.maxBytes) {
    throw new Error("image_too_large");
  }

  const ct = res.headers.get("content-type") || pickContentTypeFromUrl(opts.url);
  const base64 = Buffer.from(ab).toString("base64");
  return { dataUrl: `data:${ct};base64,${base64}`, bytes: ab.byteLength };
}

export function sanitizeImageFindings(v: unknown): Array<{
  imageIndex: number;
  label: string;
  severity: "low" | "medium" | "high";
  excerpt: string;
  rationale: string;
  confidence?: number;
}> {
  if (!Array.isArray(v)) return [];
  const out: Array<{
    imageIndex: number;
    label: string;
    severity: "low" | "medium" | "high";
    excerpt: string;
    rationale: string;
    confidence?: number;
  }> = [];

  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const imageIndex = typeof o.imageIndex === "number" ? o.imageIndex : -1;
    const label = typeof o.label === "string" ? o.label : "";
    const sevRaw = typeof o.severity === "string" ? o.severity : "low";
    const severity = (["low", "medium", "high"] as const).includes(sevRaw as never)
      ? (sevRaw as "low" | "medium" | "high")
      : "low";
    const excerpt = typeof o.excerpt === "string" ? o.excerpt : "";
    const rationale = typeof o.rationale === "string" ? o.rationale : "";
    const confidence =
      typeof o.confidence === "number" && Number.isFinite(o.confidence)
        ? Math.max(0, Math.min(1, o.confidence))
        : undefined;

    if (imageIndex < 0 || !label || !excerpt || !rationale) continue;
    out.push({
      imageIndex,
      label,
      severity,
      excerpt: maskDigits(excerpt),
      rationale: maskDigits(rationale),
      confidence,
    });
  }
  return out;
}

export async function callOpenAIVisionForPost(opts: {
  apiKey: string;
  blogId: string;
  post: { logNo: string; url: string; title: string; publishedAt?: string };
  imageDataUrls: Array<{ imageIndex: number; dataUrl: string }>;
  imageUrls: string[];
}) {
  const model = "gpt-4o-mini";

  const system = [
    "너는 OSINT/개인정보 노출을 진단하는 보안 분석가다.",
    "입력은 공개 블로그 게시물의 이미지들이다.",
    "",
    "규칙:",
    "- 반드시 한국어로만 작성해라(영어 금지). 필요한 고유명사는 한글 표기 후 괄호로 원문을 덧붙여도 된다.",
    "- 실제 범죄를 돕는 구체적 실행 지침은 절대 제공하지 마라.",
    "- 이미지의 민감정보(주소/전화/주문/송장/차량번호 등)는 그대로 복사하지 말고 요약/마스킹만 제공해라.",
    "- 출력은 반드시 JSON만(설명/코드펜스 금지).",
    "- JSON은 반드시 JSON.parse 가능한 '엄격한 JSON'이어야 한다(문자열에 줄바꿈이 필요하면 \\n으로 escape).",
    "- findings는 입력 이미지 개수보다 많을 수 없다(이미지 1장당 최대 1개 finding).",
    "- excerpt는 80자 이내, rationale은 120자 이내로 짧게.",
    "",
    "출력(JSON):",
    "{",
    '  "findings": [{ "imageIndex": number, "label": string, "severity": "low"|"medium"|"high", "excerpt": string, "rationale": string, "confidence": number }]',
    "}",
  ].join("\n");

  const userText = JSON.stringify({
    blogId: opts.blogId,
    post: opts.post,
    images: opts.imageDataUrls.map((x) => ({
      imageIndex: x.imageIndex,
      imageUrl: opts.imageUrls[x.imageIndex] ?? "",
    })),
    note: "findings[].imageIndex는 반드시 입력 images[].imageIndex를 참조해야 합니다.",
  });

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: userText },
    ...opts.imageDataUrls.map((img) => ({
      type: "image_url",
      image_url: { url: img.dataUrl, detail: "low" },
    })),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });

  return res;
}
