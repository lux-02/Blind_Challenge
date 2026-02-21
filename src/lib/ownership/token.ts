import crypto from "node:crypto";
import { signJsonPayload, verifyJsonPayload } from "@/lib/security/signing";

export const OWNERSHIP_COOKIE_NAME = "bc_own_v1";

const CHALLENGE_TOKEN_TYPE = "bc-own-challenge-v1";
const SESSION_TOKEN_TYPE = "bc-own-session-v1";
const CHALLENGE_TTL_SEC = 180;
const SESSION_TTL_SEC = 3600;

const NONCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NONCE_PATTERN = /^BLIND-[A-Z0-9]{6}$/;

type ChallengePayload = {
  typ: typeof CHALLENGE_TOKEN_TYPE;
  blogHash: string;
  nonce: string;
  iat: number;
  exp: number;
};

type SessionPayload = {
  typ: typeof SESSION_TOKEN_TYPE;
  blogHash: string;
  iat: number;
  exp: number;
};

export function getOwnershipSecret(): string | null {
  const v =
    process.env.BLINDCHAL_OWNERSHIP_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  return v ? v : null;
}

export function normalizeBlogId(v: string): string {
  return v.trim().toLowerCase();
}

function hashBlogId(blogId: string, secret: string): string {
  return crypto
    .createHash("sha256")
    .update(`blog:${secret}:${normalizeBlogId(blogId)}`)
    .digest("hex")
    .slice(0, 40);
}

function makeNonce(): string {
  let s = "";
  while (s.length < 6) {
    const idx = crypto.randomInt(0, NONCE_CHARS.length);
    s += NONCE_CHARS[idx];
  }
  return `BLIND-${s}`;
}

export function issueOwnershipChallengeToken(opts: {
  blogId: string;
  secret: string;
  nowSec?: number;
}): {
  nonce: string;
  challengeToken: string;
  expiresInSec: number;
  expiresAt: string;
} {
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const nonce = makeNonce();
  const payload: ChallengePayload = {
    typ: CHALLENGE_TOKEN_TYPE,
    blogHash: hashBlogId(opts.blogId, opts.secret),
    nonce,
    iat: nowSec,
    exp: nowSec + CHALLENGE_TTL_SEC,
  };

  return {
    nonce,
    challengeToken: signJsonPayload(payload, opts.secret),
    expiresInSec: CHALLENGE_TTL_SEC,
    expiresAt: new Date((nowSec + CHALLENGE_TTL_SEC) * 1000).toISOString(),
  };
}

export function verifyOwnershipChallengeToken(opts: {
  challengeToken: string;
  blogId: string;
  secret: string;
}): { ok: true; nonce: string } | { ok: false; error: string } {
  const verified = verifyJsonPayload<ChallengePayload>({
    token: opts.challengeToken,
    secret: opts.secret,
  });
  if (!verified.ok) return { ok: false, error: verified.error };

  const payload = verified.payload;
  if (payload.typ !== CHALLENGE_TOKEN_TYPE) {
    return { ok: false, error: "invalid_type" };
  }

  if (payload.blogHash !== hashBlogId(opts.blogId, opts.secret)) {
    return { ok: false, error: "blog_mismatch" };
  }

  if (typeof payload.nonce !== "string" || !NONCE_PATTERN.test(payload.nonce)) {
    return { ok: false, error: "invalid_nonce" };
  }

  return { ok: true, nonce: payload.nonce };
}

export function issueOwnershipSessionToken(opts: {
  blogId: string;
  secret: string;
  nowSec?: number;
}): {
  token: string;
  expiresInSec: number;
  expiresAt: string;
} {
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    typ: SESSION_TOKEN_TYPE,
    blogHash: hashBlogId(opts.blogId, opts.secret),
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SEC,
  };

  return {
    token: signJsonPayload(payload, opts.secret),
    expiresInSec: SESSION_TTL_SEC,
    expiresAt: new Date((nowSec + SESSION_TTL_SEC) * 1000).toISOString(),
  };
}

export function verifyOwnershipSessionToken(opts: {
  token: string;
  blogId: string;
  secret: string;
}): { ok: true } | { ok: false; error: string } {
  const verified = verifyJsonPayload<SessionPayload>({
    token: opts.token,
    secret: opts.secret,
  });
  if (!verified.ok) return { ok: false, error: verified.error };

  const payload = verified.payload;
  if (payload.typ !== SESSION_TOKEN_TYPE) return { ok: false, error: "invalid_type" };
  if (payload.blogHash !== hashBlogId(opts.blogId, opts.secret)) {
    return { ok: false, error: "blog_mismatch" };
  }
  return { ok: true };
}

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    if (k !== name) continue;
    const v = pair.slice(idx + 1).trim();
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }

  return null;
}
