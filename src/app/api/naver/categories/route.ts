import { NextResponse } from "next/server";
import {
  fetchBlogCategories,
  pickChallengeCategoryCandidates,
  type BlogCategory,
} from "@/lib/naver/mblogScraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function scoreCategory(c: BlogCategory) {
  const name = c.categoryName.replace(/\s+/g, "").trim();
  let score = 0;
  if (name.includes("[블챌]")) score += 120;
  if (name.includes("왓츠인마이블로그")) score += 260;
  if (name.includes("주간일기")) score += 80;
  if (name.includes("블챌")) score += 70;
  if (name.includes("체크인")) score += 40;
  if (name.includes("챌린지")) score += 30;
  score += Math.min(30, Math.floor(c.postCnt / 3));
  return score;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { blogId?: unknown }
      | null;
    const blogIdRaw = body?.blogId;
    const blogId = typeof blogIdRaw === "string" ? blogIdRaw.trim() : "";
    if (!blogId) {
      return NextResponse.json({ error: "blogId is required" }, { status: 400 });
    }

    const categories = await fetchBlogCategories(blogId);
    const picked = pickChallengeCategoryCandidates(categories);
    const candidates = picked.candidates
      .slice()
      .sort((a, b) => scoreCategory(b) - scoreCategory(a));
    const recommended = candidates[0] ?? null;

    return NextResponse.json(
      {
        blogId,
        categoryCount: categories.length,
        candidates,
        recommendedCategoryNo: recommended?.categoryNo ?? null,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
