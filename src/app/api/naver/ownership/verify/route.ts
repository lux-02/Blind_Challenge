import { NextResponse } from "next/server";
import { checkInMemoryRateLimit } from "@/lib/rateLimit";
import { verifyBlogIntroContainsNonce } from "@/lib/naver/introVerifier";
import {
  getOwnershipSecret,
  issueOwnershipSessionToken,
  normalizeBlogId,
  OWNERSHIP_COOKIE_NAME,
  verifyOwnershipChallengeToken,
} from "@/lib/ownership/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOG_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,49}$/;

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

function limitOrResponse(opts: {
  namespace: string;
  key: string;
  windowMs: number;
  limit: number;
}): NextResponse | null {
  const hit = checkInMemoryRateLimit(opts);
  if (hit.allowed) return null;
  const retrySec = Math.max(1, Math.ceil(hit.retryAfterMs / 1000));
  return NextResponse.json(
    { error: "rate_limited", retryAfterMs: hit.retryAfterMs },
    {
      status: 429,
      headers: { "retry-after": String(retrySec) },
    },
  );
}

export async function POST(req: Request) {
  const secret = getOwnershipSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "ownership_not_configured", message: "ownership signing secret is not set" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { blogId?: unknown; challengeToken?: unknown }
    | null;
  const rawBlogId = typeof body?.blogId === "string" ? body.blogId : "";
  const blogId = normalizeBlogId(rawBlogId);
  if (!blogId) {
    return NextResponse.json({ error: "blogId is required" }, { status: 400 });
  }
  if (!BLOG_ID_PATTERN.test(blogId)) {
    return NextResponse.json({ error: "invalid_blogId" }, { status: 400 });
  }

  const challengeToken =
    typeof body?.challengeToken === "string" ? body.challengeToken.trim() : "";
  if (!challengeToken) {
    return NextResponse.json({ error: "challengeToken is required" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const ipLimited = limitOrResponse({
    namespace: "ownership-verify-ip",
    key: ip,
    windowMs: 60_000,
    limit: 12,
  });
  if (ipLimited) return ipLimited;

  const blogLimited = limitOrResponse({
    namespace: "ownership-verify-blog",
    key: blogId,
    windowMs: 60_000,
    limit: 8,
  });
  if (blogLimited) return blogLimited;

  const tokenCheck = verifyOwnershipChallengeToken({
    challengeToken,
    blogId,
    secret,
  });
  if (!tokenCheck.ok) {
    return NextResponse.json(
      { error: "challenge_invalid", reason: tokenCheck.error },
      { status: tokenCheck.error === "expired" ? 401 : 400 },
    );
  }

  try {
    const verified = await verifyBlogIntroContainsNonce({
      blogId,
      nonce: tokenCheck.nonce,
    });
    if (!verified.ok) {
      return NextResponse.json(
        {
          error: "ownership_check_failed",
          reason: verified.error,
          message:
            "소개글에서 인증 코드를 찾지 못했습니다. 코드를 입력/저장 후 다시 시도해 주세요.",
        },
        { status: 403 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "ownership_check_failed",
        message: e instanceof Error ? e.message : "intro_check_failed",
      },
      { status: 502 },
    );
  }

  const session = issueOwnershipSessionToken({ blogId, secret });
  const res = NextResponse.json(
    {
      ok: true,
      blogId,
      verifiedAt: new Date().toISOString(),
      sessionExpiresAt: session.expiresAt,
      sessionExpiresInSec: session.expiresInSec,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );

  res.cookies.set({
    name: OWNERSHIP_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.expiresInSec,
  });

  return res;
}
