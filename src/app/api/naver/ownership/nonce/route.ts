import { NextResponse } from "next/server";
import { checkInMemoryRateLimit } from "@/lib/rateLimit";
import {
  getOwnershipSecret,
  issueOwnershipChallengeToken,
  normalizeBlogId,
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

  const body = (await req.json().catch(() => null)) as { blogId?: unknown } | null;
  const raw = typeof body?.blogId === "string" ? body.blogId : "";
  const blogId = normalizeBlogId(raw);
  if (!blogId) {
    return NextResponse.json({ error: "blogId is required" }, { status: 400 });
  }
  if (!BLOG_ID_PATTERN.test(blogId)) {
    return NextResponse.json({ error: "invalid_blogId" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const ipLimited = limitOrResponse({
    namespace: "ownership-nonce-ip",
    key: ip,
    windowMs: 60_000,
    limit: 10,
  });
  if (ipLimited) return ipLimited;

  const blogLimited = limitOrResponse({
    namespace: "ownership-nonce-blog",
    key: blogId,
    windowMs: 30_000,
    limit: 3,
  });
  if (blogLimited) return blogLimited;

  const issued = issueOwnershipChallengeToken({ blogId, secret });
  return NextResponse.json(
    {
      blogId,
      nonce: issued.nonce,
      challengeToken: issued.challengeToken,
      expiresAt: issued.expiresAt,
      expiresInSec: issued.expiresInSec,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
