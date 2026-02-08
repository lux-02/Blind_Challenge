import { NextResponse } from "next/server";
import { createSession } from "@/lib/naver/mblogScraper";
import type { ImageFinding, VisionCursor } from "@/lib/types";
import { getRetryAfterMs } from "@/lib/rateLimit";
import {
  callOpenAIVisionForPost,
  extractJsonObjectFromChatCompletions,
  fetchImageAsDataUrl,
  isAllowedRemoteImageUrl,
  sanitizeImageFindings,
} from "@/lib/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asCursor(v: unknown): VisionCursor | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const postIndex = typeof o.postIndex === "number" ? o.postIndex : -1;
  const imageIndex = typeof o.imageIndex === "number" ? o.imageIndex : -1;
  if (!Number.isFinite(postIndex) || !Number.isFinite(imageIndex)) return null;
  if (postIndex < 0 || imageIndex < 0) return null;
  return { postIndex: Math.floor(postIndex), imageIndex: Math.floor(imageIndex) };
}

function totalImages(posts: Array<{ images?: unknown }>): number {
  let total = 0;
  for (const p of posts) {
    total += Array.isArray(p.images) ? p.images.length : 0;
  }
  return total;
}

function absoluteIndex(opts: {
  posts: Array<{ images: string[] }>;
  cursor: VisionCursor;
}): number {
  let idx = 0;
  for (let i = 0; i < opts.posts.length; i++) {
    const len = opts.posts[i]!.images.length;
    if (i < opts.cursor.postIndex) idx += len;
  }
  idx += Math.min(opts.cursor.imageIndex, opts.posts[opts.cursor.postIndex]?.images.length ?? 0);
  return idx;
}

function advanceCursor(posts: Array<{ images: string[] }>, cur: VisionCursor): VisionCursor | null {
  let postIndex = cur.postIndex;
  let imageIndex = cur.imageIndex;

  while (postIndex < posts.length) {
    const imgs = posts[postIndex]!.images;
    if (!imgs.length) {
      postIndex += 1;
      imageIndex = 0;
      continue;
    }
    if (imageIndex >= imgs.length) {
      postIndex += 1;
      imageIndex = 0;
      continue;
    }
    return { postIndex, imageIndex };
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        blogId?: unknown;
        posts?: unknown;
        cursor?: unknown;
        maxImages?: unknown;
      }
    | null;

  const blogId = typeof body?.blogId === "string" ? body.blogId.trim() : "";
  if (!blogId) return NextResponse.json({ error: "blogId is required" }, { status: 400 });

  const postsRaw = Array.isArray(body?.posts) ? body!.posts : [];
  const posts = postsRaw
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
    .filter(Boolean)
    .map((p) => ({
      logNo: typeof p!.logNo === "string" ? p!.logNo : "",
      url: typeof p!.url === "string" ? p!.url : "",
      title: typeof p!.title === "string" ? p!.title : "",
      publishedAt: typeof p!.publishedAt === "string" ? p!.publishedAt : undefined,
      images: Array.isArray(p!.images) ? (p!.images.filter((x) => typeof x === "string") as string[]) : [],
    }))
    .filter((p) => p.logNo && p.url && p.title);

  if (!posts.length) {
    return NextResponse.json({ error: "posts is required" }, { status: 400 });
  }

  const cursor = asCursor(body?.cursor) ?? { postIndex: 0, imageIndex: 0 };
  const total = totalImages(posts);

  const maxImagesDefault = Number(process.env.BLINDCHAL_VISION_MAX_IMAGES_PER_CALL || 12);
  const maxImages =
    typeof body?.maxImages === "number" && Number.isFinite(body.maxImages)
      ? Math.max(1, Math.min(25, Math.floor(body.maxImages)))
      : Math.max(1, Math.min(25, Math.floor(maxImagesDefault)));

  const maxImageBytes = Number(process.env.BLINDCHAL_MAX_IMAGE_BYTES || 1_500_000);

  // Session cookies for fetching Naver-hosted images (best-effort).
  const session = await createSession(blogId);

  const start = advanceCursor(posts, {
    postIndex: Math.min(cursor.postIndex, posts.length - 1),
    imageIndex: cursor.imageIndex,
  });
  if (!start) {
    return NextResponse.json(
      { findings: [], cursorNext: null, done: true, processedImages: total, totalImages: total },
      { status: 200 },
    );
  }

  const post = posts[start.postIndex]!;
  let imgIdx = start.imageIndex;
  const chunkStart: VisionCursor = { postIndex: start.postIndex, imageIndex: start.imageIndex };

  const toDownload: Array<{ imageIndex: number; url: string }> = [];
  while (imgIdx < post.images.length && toDownload.length < maxImages) {
    const url = post.images[imgIdx]!;
    const idx = imgIdx;
    imgIdx += 1;
    if (!isAllowedRemoteImageUrl(url)) continue;
    toDownload.push({ imageIndex: idx, url });
  }

  const cursorNextRaw: VisionCursor = { postIndex: start.postIndex, imageIndex: imgIdx };
  const cursorNext = advanceCursor(posts, cursorNextRaw);
  const processedAbs = cursorNext ? absoluteIndex({ posts, cursor: cursorNext }) : total;

  if (!toDownload.length) {
    return NextResponse.json(
      {
        findings: [],
        cursorNext,
        done: cursorNext == null,
        processedImages: processedAbs,
        totalImages: total,
      },
      { status: 200 },
    );
  }

  // Download in parallel (bounded) to reduce route wall time.
  const settled = await Promise.allSettled(
    toDownload.map(async (x) => {
      const { dataUrl } = await fetchImageAsDataUrl({
        url: x.url,
        session,
        referer: post.url,
        maxBytes: maxImageBytes,
      });
      return { imageIndex: x.imageIndex, dataUrl };
    }),
  );
  const downloaded = settled
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ imageIndex: number; dataUrl: string }>).value);

  if (!downloaded.length) {
    return NextResponse.json(
      {
        findings: [],
        cursorNext,
        done: cursorNext == null,
        processedImages: processedAbs,
        totalImages: total,
      },
      { status: 200 },
    );
  }

  const res = await callOpenAIVisionForPost({
    apiKey,
    blogId,
    post: {
      logNo: post.logNo,
      url: post.url,
      title: post.title,
      publishedAt: post.publishedAt,
    },
    imageUrls: post.images,
    imageDataUrls: downloaded,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) {
      const retryAfterMs = getRetryAfterMs(res.headers, 8000);
      return NextResponse.json(
        {
          error: `openai_vision_429`,
          retryAfterMs,
          cursor: chunkStart,
          processedImages: absoluteIndex({ posts, cursor: chunkStart }),
          totalImages: total,
        },
        {
          status: 429,
          headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
        },
      );
    }

    return NextResponse.json(
      { error: `openai_vision_${res.status}`, details: txt.slice(0, 200) },
      { status: 502 },
    );
  }

  const text = await res.text();
  let extracted: Record<string, unknown>;
  try {
    extracted = extractJsonObjectFromChatCompletions(text);
  } catch (e) {
    // Be resilient: advance the cursor even if parsing fails, so the client can
    // continue processing the rest of the images without getting stuck.
    return NextResponse.json(
      {
        findings: [],
        cursorNext,
        done: cursorNext == null,
        processedImages: processedAbs,
        totalImages: total,
        warning: `openai_vision_parse_failed:${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 200 },
    );
  }
  const findings = sanitizeImageFindings(extracted.findings);
  const outgoingFindings: ImageFinding[] = [];
  for (const f of findings) {
    const imgUrl = post.images[f.imageIndex] ?? "";
    if (!imgUrl) continue;
    outgoingFindings.push({
      postLogNo: post.logNo,
      postUrl: post.url,
      postTitle: post.title,
      imageUrl: imgUrl,
      imageIndex: f.imageIndex,
      label: f.label,
      severity: f.severity,
      excerpt: f.excerpt,
      rationale: f.rationale,
      confidence: f.confidence,
    });
  }

  return NextResponse.json(
    {
      findings: outgoingFindings,
      cursorNext,
      done: cursorNext == null,
      processedImages: processedAbs,
      totalImages: total,
    },
    { status: 200 },
  );
}
