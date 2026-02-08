import { NextResponse } from "next/server";
import {
  createSession,
  fetchBlogCategories,
  pickChallengeCategoryCandidates,
  type BlogCategory,
} from "@/lib/naver/mblogScraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowISODate() {
  return new Date().toISOString().slice(0, 10);
}

function cutoffMs(daysBack: number) {
  return Date.now() - daysBack * 24 * 60 * 60 * 1000;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

async function fetchJsonWithSession(url: string, session: { cookie: string; referer: string }) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "application/json, text/plain, */*",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      "x-requested-with": "XMLHttpRequest",
      referer: session.referer,
      cookie: session.cookie,
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    redirect: "follow",
    cache: "no-store",
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  try {
    return JSON.parse(txt) as unknown;
  } catch {
    throw new Error(`invalid_json (${url})`);
  }
}

async function categoryHasRecentPosts(opts: {
  blogId: string;
  categoryNo: number;
  session: { cookie: string; referer: string };
  cutoffAddDateMs: number;
}): Promise<boolean> {
  const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(
    opts.blogId,
  )}/post-list?categoryNo=${encodeURIComponent(String(opts.categoryNo))}&page=1`;

  const json = await fetchJsonWithSession(url, opts.session);
  const root = isRecord(json) ? json : null;
  const result = root && isRecord(root.result) ? root.result : null;
  const items = result?.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  const first = isRecord(items[0]) ? items[0] : null;
  const addDate = first && typeof first.addDate === "number" ? first.addDate : null;
  if (!addDate || !Number.isFinite(addDate)) return false;
  return addDate >= opts.cutoffAddDateMs;
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }).map(
    async () => {
      while (true) {
        const idx = i;
        i += 1;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]!, idx);
      }
    },
  );

  await Promise.all(workers);
  return out;
}

function norm(s: string) {
  return s.replace(/\s+/g, "").trim().toLowerCase();
}

function heuristicHighRiskCategory(nameRaw: string): boolean {
  const n = norm(nameRaw);
  const needles = [
    "일기",
    "주간일기",
    "일상",
    "여행",
    "챌린지",
    "블챌",
    "왓츠인마이블로그",
    "체크인",
    "가족",
    "육아",
    "아이",
    "자녀",
    "학교",
    "학원",
    "회사",
    "직장",
    "출퇴근",
    "동선",
    "루틴",
    "운동",
    "맛집",
    "카페",
  ].map(norm);
  return needles.some((k) => n.includes(k));
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

async function classifyCategoriesWithOpenAI(opts: {
  apiKey: string;
  model: string;
  categories: Array<{ categoryNo: number; categoryName: string; postCnt: number; openYN: boolean }>;
}) {
  const system = [
    "너는 OSINT 관점에서 공개 블로그 카테고리명이 개인정보/생활패턴 노출 위험이 높은지 분류하는 보안 분석가다.",
    "",
    "규칙:",
    "- 반드시 한국어로만 작성해라(영어 금지).",
    "- 과장하지 말고, 카테고리 이름만을 근거로 '해커가 주목할 가능성'을 1문장으로 설명해라.",
    "- 불법/범죄 실행 지침은 절대 제공하지 마라.",
    "- 출력은 반드시 JSON만(설명/코드펜스 금지), JSON.parse 가능한 엄격한 JSON이어야 한다.",
    "",
    "출력(JSON) 스키마:",
    "{",
    '  "items": [{ "categoryNo": number, "risk": "high"|"normal", "reason": string }]',
    "}",
  ].join("\n");

  const payload = {
    categories: opts.categories.map((c) => ({
      categoryNo: c.categoryNo,
      categoryName: c.categoryName,
      postCnt: c.postCnt,
      openYN: c.openYN,
    })),
    hints: [
      "일기/일상/여행/루틴/동선/가족/육아/학교/회사/챌린지 계열은 high로 기울여라.",
      "애매하면 normal로 두어라(보수적 분류).",
    ],
  };

  const baseBody: Record<string, unknown> = {
    model: opts.model,
    temperature: 0,
    max_tokens: 900,
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

      const txt = await res.text();
      if (!res.ok) throw new Error(`openai_error_${res.status}: ${txt.slice(0, 240)}`);
      const obj = extractJsonObjectFromChatCompletions(txt);
      const items = Array.isArray(obj.items) ? obj.items : [];
      const out = new Map<number, { risk: "high" | "normal"; reason: string }>();

      for (const it of items) {
        const r = isRecord(it) ? it : null;
        const categoryNo = r && typeof r.categoryNo === "number" ? r.categoryNo : null;
        const riskRaw = r && typeof r.risk === "string" ? r.risk : "";
        const reason = r && typeof r.reason === "string" ? r.reason.trim() : "";
        if (categoryNo == null) continue;
        const risk = riskRaw === "high" ? "high" : "normal";
        out.set(categoryNo, {
          risk,
          reason: reason.slice(0, 140),
        });
      }

      return out;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("openai_error");
    }
  }

  throw lastErr ?? new Error("openai_error");
}

function scoreCategoryForSorting(c: {
  risk: "high" | "normal";
  isChallenge: boolean;
  postCnt: number;
  categoryName: string;
}) {
  // Challenge + High risk first, then High risk, then others. Within same bucket, prefer more posts.
  let s = 0;
  if (c.isChallenge) s += 2000;
  if (c.risk === "high") s += 1200;
  s += Math.min(300, Math.max(0, c.postCnt));
  // Small bias for diary-like names.
  const n = norm(c.categoryName);
  if (n.includes(norm("일기")) || n.includes(norm("일상")) || n.includes(norm("여행"))) s += 30;
  return s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { blogId?: unknown }
      | null;
    const blogIdRaw = body?.blogId;
    const blogId = typeof blogIdRaw === "string" ? blogIdRaw.trim() : "";
    if (!blogId) return NextResponse.json({ error: "blogId is required" }, { status: 400 });

    const warnings: string[] = [];
    const cutoffAddDateMs = cutoffMs(365);
    const cutoffDate = new Date(cutoffAddDateMs).toISOString().slice(0, 10);

    const session = await createSession(blogId);
    const allCategories = await fetchBlogCategories(blogId, session);

    // Identify challenge categories (force high risk + top).
    const picked = pickChallengeCategoryCandidates(allCategories);
    const challengeNos = new Set<number>(picked.candidates.map((c) => c.categoryNo));

    // Recent-activity filter. If too many categories, degrade to reduce requests.
    const degrade = allCategories.length > 60;
    let activeCategories: BlogCategory[] = [];
    if (degrade) {
      warnings.push(
        `카테고리가 많아(${allCategories.length}개) 정찰 비용을 줄이기 위해 '최근 1년' 검사를 단순화했습니다.`,
      );
      activeCategories = allCategories.filter((c) => (c.postCnt ?? 0) > 0);
    } else {
      const checks = allCategories.filter((c) => (c.postCnt ?? 0) > 0);
      const flags = await mapLimit(
        checks,
        4,
        async (c) => {
          try {
            const ok = await categoryHasRecentPosts({
              blogId,
              categoryNo: c.categoryNo,
              session,
              cutoffAddDateMs,
            });
            return { categoryNo: c.categoryNo, ok };
          } catch {
            // Best-effort: if blocked, keep it, but warn once.
            return { categoryNo: c.categoryNo, ok: true };
          }
        },
      );
      const okSet = new Set(flags.filter((f) => f.ok).map((f) => f.categoryNo));
      activeCategories = allCategories.filter((c) => {
        if (challengeNos.has(c.categoryNo)) return true; // force keep
        if ((c.postCnt ?? 0) <= 0) return false;
        return okSet.has(c.categoryNo);
      });
    }

    // OpenAI classification (optional).
    const apiKey = process.env.OPENAI_API_KEY;
    let aiMap: Map<number, { risk: "high" | "normal"; reason: string }> | null = null;
    if (apiKey) {
      try {
        const model = process.env.OPENAI_RECON_MODEL || "gpt-4o-mini";
        aiMap = await classifyCategoriesWithOpenAI({
          apiKey,
          model,
          categories: activeCategories.map((c) => ({
            categoryNo: c.categoryNo,
            categoryName: c.categoryName,
            postCnt: c.postCnt,
            openYN: c.openYN,
          })),
        });
      } catch (e) {
        warnings.push(
          e instanceof Error
            ? `AI 분류 실패로 휴리스틱으로 대체했습니다: ${e.message}`
            : "AI 분류 실패로 휴리스틱으로 대체했습니다.",
        );
        aiMap = null;
      }
    } else {
      warnings.push("OPENAI_API_KEY가 없어 AI 분류를 건너뛰고 휴리스틱으로 대체했습니다.");
    }

    const outCategories = activeCategories
      .map((c) => {
        const isChallenge = challengeNos.has(c.categoryNo);
        const ai = aiMap?.get(c.categoryNo) ?? null;
        const heuristicHigh = heuristicHighRiskCategory(c.categoryName);
        const risk: "high" | "normal" = isChallenge
          ? "high"
          : ai
            ? ai.risk
            : heuristicHigh
              ? "high"
              : "normal";
        const riskReason =
          isChallenge
            ? "블챌/주간일기 계열은 생활 패턴이 축적되어 OSINT 표적화에 활용될 수 있습니다."
            : ai?.reason || (risk === "high" ? "생활/관계/동선 정보가 누적될 수 있는 주제입니다." : "");
        return {
          categoryNo: c.categoryNo,
          categoryName: c.categoryName,
          postCnt: c.postCnt,
          openYN: c.openYN,
          risk,
          riskReason: riskReason ? riskReason.slice(0, 140) : undefined,
          isChallenge,
        };
      })
      .sort((a, b) => scoreCategoryForSorting(b) - scoreCategoryForSorting(a));

    const highRiskCount = outCategories.filter((c) => c.risk === "high").length;
    const defaultSelectedCategoryNos = Array.from(
      new Set(outCategories.filter((c) => c.risk === "high" || c.isChallenge).map((c) => c.categoryNo)),
    );

    return NextResponse.json(
      {
        blogId,
        cutoffDate,
        asOfDate: nowISODate(),
        categoryCount: outCategories.length,
        highRiskCount,
        defaultSelectedCategoryNos,
        categories: outCategories,
        warnings: warnings.slice(0, 10),
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "internal_error", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

