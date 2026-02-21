import { NextResponse } from "next/server";
import { buildMockReport } from "@/lib/mockReport";
import type {
  BlindReport,
  ExtractedPiece,
  RiskNode,
  Scenario,
  ScrapedContent,
} from "@/lib/types";
import {
  fetchBlogCategories,
  pickChallengeCategoryCandidates,
  createSession,
  scrapePostsFromCategoryNo,
} from "@/lib/naver/mblogScraper";
import type { ImageFinding } from "@/lib/types";
import { scoreReport } from "@/lib/scoring";
import { requireOwnershipOrThrow } from "@/lib/ownership/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CATEGORY_NEEDLE = "[블챌] 왓츠인마이블로그";

function nowISO() {
  return new Date().toISOString();
}

type ScrapedPostBase = Awaited<ReturnType<typeof scrapePostsFromCategoryNo>>[number];
type ScrapedPostWithMeta = ScrapedPostBase & { categoryNo: number; categoryName: string };
type AnyScrapedPost = ScrapedPostBase | ScrapedPostWithMeta;

function hasCategoryMeta(p: AnyScrapedPost): p is ScrapedPostWithMeta {
  return (
    typeof (p as Record<string, unknown>).categoryNo === "number" &&
    Number.isFinite((p as Record<string, unknown>).categoryNo) &&
    typeof (p as Record<string, unknown>).categoryName === "string"
  );
}

function jsonFromText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Best-effort: extract first JSON object.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("invalid_json");
  }
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function sanitizeExtractedPieces(v: unknown): ExtractedPiece[] {
  return asArray<unknown>(v)
    .map((x) => (typeof x === "object" && x ? (x as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((o) => {
      const typeRaw = typeof o!.type === "string" ? o!.type : "other";
      const type = ([
        "address_hint",
        "schedule",
        "family",
        "photo_metadata",
        "other",
      ] as const).includes(typeRaw as never)
        ? (typeRaw as ExtractedPiece["type"])
        : "other";

      const evRaw =
        typeof o!.evidence === "object" && o!.evidence
          ? (o!.evidence as Record<string, unknown>)
          : null;
      const evidence =
        evRaw &&
        typeof evRaw.postUrl === "string" &&
        typeof evRaw.postTitle === "string" &&
        typeof evRaw.excerpt === "string" &&
        typeof evRaw.rationale === "string"
          ? {
              postUrl: evRaw.postUrl,
              postTitle: evRaw.postTitle,
              logNo: typeof evRaw.logNo === "string" ? evRaw.logNo : undefined,
              excerpt: evRaw.excerpt,
              rationale: evRaw.rationale,
              confidence:
                typeof evRaw.confidence === "number" &&
                Number.isFinite(evRaw.confidence)
                  ? Math.max(0, Math.min(1, evRaw.confidence))
                  : undefined,
            }
          : undefined;

      return {
        type,
        value: typeof o!.value === "string" ? o!.value : "",
        evidencePostDate:
          typeof o!.evidencePostDate === "string" ? o!.evidencePostDate : "",
        evidence,
      } satisfies ExtractedPiece;
    })
    .filter((p) => p.value && p.evidencePostDate);
}

function sanitizeRiskNodes(v: unknown): RiskNode[] {
  return asArray<unknown>(v)
    .map((x) => (typeof x === "object" && x ? (x as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((o, i) => {
      const sevRaw = typeof o!.severity === "string" ? o!.severity : "medium";
      const severity = (["low", "medium", "high"] as const).includes(sevRaw as never)
        ? (sevRaw as RiskNode["severity"])
        : "medium";
      return {
        id: typeof o!.id === "string" ? o!.id : `risk-${i + 1}`,
        label: typeof o!.label === "string" ? o!.label : "",
        severity,
      } satisfies RiskNode;
    })
    .filter((r) => r.label);
}

function sanitizeScenarios(v: unknown): Scenario[] {
  return asArray<unknown>(v)
    .map((x) => (typeof x === "object" && x ? (x as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((o, i) => {
      return {
        id: typeof o!.id === "string" ? o!.id : `scn-${i + 1}`,
        title: typeof o!.title === "string" ? o!.title : "",
        narrative: typeof o!.narrative === "string" ? o!.narrative : "",
      } satisfies Scenario;
    })
    .filter((s) => s.title && s.narrative);
}

async function callOpenAI(opts: {
  apiKey: string;
  blogId: string;
  categoryName?: string;
  posts: Array<{
    title: string;
    publishedAt?: string;
    url: string;
    text: string;
    images: string[];
    categoryName?: string;
  }>;
}) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const payload = {
    blogId: opts.blogId,
    categoryName: opts.categoryName ?? "",
    posts: opts.posts.map((p, idx) => ({
      index: idx,
      title: p.title,
      publishedAt: p.publishedAt ?? "",
      url: p.url,
      categoryName: p.categoryName ?? "",
      // Hard cap per post to keep request bounded.
      text: p.text.slice(0, 6000),
      images: p.images.slice(0, 12),
    })),
  };

  const system = [
    "너는 OSINT 기반 개인정보 노출을 진단하는 보안 분석가다.",
    "목표: 아래 블로그 게시물 텍스트/이미지 URL로부터 (1) 개인정보/민감정보 단서, (2) 생활 패턴, (3) 이를 악용할 수 있는 '가능한 공격 시나리오'를 '방어/경각심' 목적의 시뮬레이션으로 정리한다.",
    "",
    "중요 안전 규칙:",
    "- 실제 범죄를 돕는 구체적 실행 지침(침입 방법, 회피 방법, 표적화 절차, 불법 행위 단계)은 절대 제공하지 마라.",
    "- 보이스피싱/스미싱은 '훈련용 예시'로만 제공하고, 링크/전화번호/계좌/기관 사칭 디테일을 넣지 마라.",
    "- 출력은 반드시 JSON만(설명 텍스트 금지).",
    "",
    "출력 JSON 스키마(필드명 고정):",
    "{",
    '  "riskScore": number,',
    '  "extractedPieces": [{',
    '     "type": "address_hint"|"schedule"|"family"|"photo_metadata"|"other",',
    '     "value": string,',
    '     "evidencePostDate": "YYYY-MM-DD",',
    '     "evidence": { "postUrl": string, "postTitle": string, "logNo": string, "excerpt": string, "rationale": string, "confidence": number }',
    "  }],",
    '  "riskNodes": [{ "id": string, "label": string, "severity": "low"|"medium"|"high" }],',
    '  "scenarios": [{ "id": string, "title": string, "narrative": string }],',
    '  "phishingSimulation": { "sms": string, "voiceScript": string }',
    "}",
    "",
    "evidence.excerpt는 posts[].text에서 직접 발췌한 40~160자 이내의 짧은 문장/구절로 작성해라.",
    "evidence.rationale는 왜 이 조각이 개인정보/생활패턴/관계 단서인지 1~2문장으로 설명해라(방어 목적).",
    "evidence.confidence는 0~1 범위로 추정치.",
    "evidencePostDate는 posts[].publishedAt에서 가능한 한 YYYY-MM-DD로 채워라. 없으면 빈 문자열로 두지 말고 추정하지 마라(해당 piece를 제외).",
  ].join("\n");

  const baseBody: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
  };

  // Prefer structured output if supported; fall back if API rejects it.
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

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`openai_error_${res.status}: ${text.slice(0, 240)}`);
      }
      const json = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) throw new Error("openai_empty_content");
      return jsonFromText(content) as Record<string, unknown>;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("openai_error");
    }
  }

  throw lastErr ?? new Error("openai_error");
}


export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          blogId?: unknown;
          mode?: unknown;
          maxPosts?: unknown;
          categoryNo?: unknown;
          categoryNos?: unknown;
        }
      | null;
    const blogIdRaw = body?.blogId;
    const blogId = typeof blogIdRaw === "string" ? blogIdRaw.trim() : "";

    if (!blogId) {
      return NextResponse.json(
        { error: "blogId is required" },
        { status: 400 },
      );
    }

    const denied = requireOwnershipOrThrow(req, blogId);
    if (denied) return denied;

    const mode = typeof body?.mode === "string" ? body.mode : "live";
    const maxPosts =
      typeof body?.maxPosts === "number" && Number.isFinite(body.maxPosts)
        ? Math.max(1, Math.min(20, Math.floor(body.maxPosts)))
        : 10;

    if (mode === "mock") {
      const report = buildMockReport(blogId);
      return NextResponse.json(report, { status: 200 });
    }

    const scrapedAt = nowISO();

    const maxDaysBack = 365;

    const session = await createSession(blogId);

    const categoriesRequestedRaw = Array.isArray(body?.categoryNos) ? body!.categoryNos : null;
    const categoriesRequested = categoriesRequestedRaw
      ? categoriesRequestedRaw
          .map((x) =>
            typeof x === "number" && Number.isFinite(x)
              ? Math.floor(x)
              : typeof x === "string" && /^\d+$/.test(x)
                ? Number(x)
                : null,
          )
          .filter((x): x is number => typeof x === "number" && x > 0)
      : [];
    const requestedUnique = Array.from(new Set(categoriesRequested)).slice(0, 12);

    // Determine category.
    let categoryNo: number | null = null;
    const categoryNoRaw = body?.categoryNo;
    if (typeof categoryNoRaw === "number" && Number.isFinite(categoryNoRaw)) {
      categoryNo = categoryNoRaw;
    } else if (typeof categoryNoRaw === "string" && /^\d+$/.test(categoryNoRaw)) {
      categoryNo = Number(categoryNoRaw);
    }

    let categoryName: string | undefined;
    let selectedCategories: Array<{ categoryNo: number; categoryName: string }> | null = null;
    let categoriesByNo: Map<number, string> | null = null;
    let allCategories: Awaited<ReturnType<typeof fetchBlogCategories>> | null = null;
    try {
      const categories = await fetchBlogCategories(blogId, session);
      allCategories = categories;
      categoriesByNo = new Map(categories.map((c) => [c.categoryNo, c.categoryName]));
    } catch {
      categoriesByNo = null;
      allCategories = null;
    }

    if (requestedUnique.length) {
      selectedCategories = requestedUnique.map((n) => ({
        categoryNo: n,
        categoryName: categoriesByNo?.get(n) ?? `categoryNo ${n}`,
      }));
      // For backward compatibility, keep single-category fields when exactly one selected.
      if (selectedCategories.length === 1) {
        categoryNo = selectedCategories[0]!.categoryNo;
        categoryName = selectedCategories[0]!.categoryName;
      } else {
        categoryNo = null;
        categoryName = selectedCategories.map((c) => c.categoryName).join(", ");
      }
    } else if (categoryNo == null) {
      // Legacy flow: auto-pick a challenge category.
      const categories = allCategories ?? (await fetchBlogCategories(blogId, session));
      const picked = pickChallengeCategoryCandidates(categories);
      categoryNo = picked.recommended?.categoryNo ?? null;
      categoryName = picked.recommended?.categoryName ?? undefined;
      if (categoryNo != null && categoryName) {
        selectedCategories = [{ categoryNo, categoryName }];
      }
    } else {
      // Best-effort lookup for display.
      categoryName = categoriesByNo?.get(categoryNo) ?? categoryName;
      if (categoryNo != null && categoryName) {
        selectedCategories = [{ categoryNo, categoryName }];
      }
    }

    if (!requestedUnique.length && categoryNo == null) {
      const report = buildMockReport(blogId);
      report.warnings = [
        `블챌/주간일기 챌린지 카테고리를 자동으로 찾지 못했어요. 샘플 리포트로 대체합니다. (기본 키워드: "${DEFAULT_CATEGORY_NEEDLE}")`,
      ];
      report.source = { scrapedAt, postCount: 0 };
      return NextResponse.json(report, { status: 200 });
    }

    let posts: AnyScrapedPost[] = [];
    const postsWithMeta: Array<
      ScrapedPostBase & {
        categoryNo: number;
        categoryName: string;
      }
    > = [];
    const warnings: string[] = [];

    try {
      if (requestedUnique.length) {
        const perCategoryCap = 8;
        const totalCap = maxPosts; // treat as total cap in multi-category mode too

        let totalCollected = 0;
        for (const cn of requestedUnique) {
          const remaining = totalCap - totalCollected;
          if (remaining <= 0) break;
          const catCap = Math.min(perCategoryCap, remaining);
          const name = categoriesByNo?.get(cn) ?? `categoryNo ${cn}`;
          const list = await scrapePostsFromCategoryNo({
            blogId,
            categoryNo: cn,
            maxMatches: catCap,
            maxDaysBack,
            session,
          });
          for (const p of list) {
            postsWithMeta.push({ ...p, categoryNo: cn, categoryName: name });
          }
          totalCollected = postsWithMeta.length;
        }

        posts = postsWithMeta;
        if (requestedUnique.length > 3 && posts.length >= totalCap) {
          warnings.push("선택 카테고리가 많아 전체 게시물 수를 제한해 일부만 반영했습니다.");
        }
      } else if (categoryNo != null) {
        posts = await scrapePostsFromCategoryNo({
          blogId,
          categoryNo,
          maxMatches: maxPosts,
          maxDaysBack,
          session,
        });
      }
    } catch (e) {
      const report = buildMockReport(blogId);
      report.warnings = [
        e instanceof Error
          ? `네이버 수집 단계에서 실패했어요. 샘플 리포트로 대체합니다. 원인: ${e.message}`
          : "네이버 수집 단계에서 실패했어요. 샘플 리포트로 대체합니다.",
      ];
      report.source = { scrapedAt, postCount: 0 };
      return NextResponse.json(report, { status: 200 });
    }

    if (!posts.length) {
      const report = buildMockReport(blogId);
      report.warnings = [
        requestedUnique.length
          ? `선택된 카테고리에서 최근 ${maxDaysBack}일 내 공개 게시물을 찾지 못했어요. 샘플 리포트로 대체합니다.`
          : `선택된 카테고리에서 최근 ${maxDaysBack}일 내 공개 게시물을 찾지 못했어요. 샘플 리포트로 대체합니다.`,
      ];
      if (categoryNo != null && categoryName) report.category = { categoryNo, categoryName };
      if (selectedCategories?.length) report.categories = selectedCategories;
      report.source = { scrapedAt, postCount: 0 };
      return NextResponse.json(report, { status: 200 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const report = buildMockReport(blogId);
      report.warnings = [
        "OPENAI_API_KEY가 설정되지 않아 AI 분석을 건너뛰었습니다. 샘플 리포트 형식으로 표시합니다.",
      ];
      report.contents = posts.map((p) => ({
        logNo: p.logNo,
        url: p.url,
        title: p.title,
        publishedAt: p.publishedAt,
        text: p.text.slice(0, 6000),
        images: p.images,
        ...(hasCategoryMeta(p)
          ? { categoryNo: p.categoryNo, categoryName: p.categoryName }
          : {}),
      }));
      if (categoryNo != null && categoryName) report.category = { categoryNo, categoryName };
      if (selectedCategories?.length) report.categories = selectedCategories;
      report.source = { scrapedAt, postCount: posts.length };
      return NextResponse.json(report, { status: 200 });
    }

    let ai: Record<string, unknown>;
    try {
      const postsForAI: Parameters<typeof callOpenAI>[0]["posts"] = posts.map((p) => {
        return {
          title: p.title,
          publishedAt: p.publishedAt,
          url: p.url,
          text: p.text,
          images: p.images,
          categoryName: hasCategoryMeta(p) ? p.categoryName : undefined,
        };
      });

      ai = await callOpenAI({
        apiKey,
        blogId,
        categoryName,
        posts: postsForAI,
      });
    } catch (e) {
      const report = buildMockReport(blogId);
      report.warnings = [
        e instanceof Error
          ? `AI 분석이 일시적으로 실패해 샘플 리포트로 대체했습니다: ${e.message}`
          : "AI 분석이 일시적으로 실패해 샘플 리포트로 대체했습니다.",
      ];
      report.contents = posts.map((p) => ({
        logNo: p.logNo,
        url: p.url,
        title: p.title,
        publishedAt: p.publishedAt,
        text: p.text.slice(0, 6000),
        images: p.images.slice(0, 12),
        ...(hasCategoryMeta(p)
          ? { categoryNo: p.categoryNo, categoryName: p.categoryName }
          : {}),
      }));
      if (categoryNo != null && categoryName) report.category = { categoryNo, categoryName };
      if (selectedCategories?.length) report.categories = selectedCategories;
      report.source = { scrapedAt, postCount: posts.length };
      return NextResponse.json(report, { status: 200 });
    }

    const extractedPieces = sanitizeExtractedPieces(ai.extractedPieces);
    const riskNodes = sanitizeRiskNodes(ai.riskNodes);
    const scenarios = sanitizeScenarios(ai.scenarios);
    const riskScore =
      typeof ai.riskScore === "number" && Number.isFinite(ai.riskScore)
        ? Math.max(0, Math.min(100, Math.round(ai.riskScore)))
        : undefined;

    const phishingSimulation =
      typeof ai.phishingSimulation === "object" && ai.phishingSimulation
        ? (ai.phishingSimulation as Record<string, unknown>)
        : null;

    const contents: ScrapedContent[] = posts.map((p) => ({
      logNo: p.logNo,
      url: p.url,
      title: p.title,
      publishedAt: p.publishedAt,
      // Bound again to keep the response manageable for UI.
      text: p.text.slice(0, 6000),
      images: p.images,
      ...(hasCategoryMeta(p)
        ? { categoryNo: p.categoryNo, categoryName: p.categoryName }
        : {}),
    }));
    // Vision pass is handled progressively from /report via /api/vision to avoid 429(TPM).
    const imageFindings: ImageFinding[] = [];
    const totalImages = contents.reduce((acc, c) => acc + (c.images?.length ?? 0), 0);

    const report: BlindReport = {
      blogId,
      generatedAt: nowISO(),
      extractedPieces,
      riskNodes,
      scenarios,
      riskScore,
      contents,
      imageFindings,
      vision: {
        status: totalImages ? "pending" : "complete",
        processedImages: 0,
        totalImages,
        cursor: totalImages ? { postIndex: 0, imageIndex: 0 } : undefined,
      },
      category: categoryNo != null && categoryName ? { categoryNo, categoryName } : undefined,
      categories: selectedCategories?.length ? selectedCategories : undefined,
      warnings: [
        ...(extractedPieces.length && riskNodes.length && scenarios.length
          ? []
          : ["AI 출력이 불완전해 일부 항목이 비어있을 수 있어요."]),
        ...warnings.slice(0, 10),
      ],
      source: { scrapedAt, postCount: posts.length },
      phishingSimulation:
        phishingSimulation &&
        typeof phishingSimulation.sms === "string" &&
        typeof phishingSimulation.voiceScript === "string"
          ? {
              sms: phishingSimulation.sms,
              voiceScript: phishingSimulation.voiceScript,
            }
          : undefined,
    };

    // Server-side scoring (includes images + recency).
    const scoring = scoreReport(report);
    report.scoring = scoring;
    report.riskScore = scoring.riskScore;

    return NextResponse.json(report, { status: 200 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
