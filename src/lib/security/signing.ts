import crypto from "node:crypto";

function toBase64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad === 0 ? normalized : normalized + "=".repeat(4 - pad);
  return Buffer.from(padded, "base64");
}

function safeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function signJsonPayload(payload: Record<string, unknown>, secret: string): string {
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${payloadB64}.${signature}`;
}

export function verifyJsonPayload<T extends Record<string, unknown>>(opts: {
  token: string;
  secret: string;
  nowSec?: number;
}): { ok: true; payload: T } | { ok: false; error: string } {
  const token = opts.token.trim();
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot >= token.length - 1) {
    return { ok: false, error: "malformed_token" };
  }

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const expectedSig = crypto
    .createHmac("sha256", opts.secret)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  if (!safeEquals(sigB64, expectedSig)) {
    return { ok: false, error: "invalid_signature" };
  }

  let payload: T;
  try {
    const json = fromBase64Url(payloadB64).toString("utf8");
    payload = JSON.parse(json) as T;
  } catch {
    return { ok: false, error: "invalid_payload" };
  }

  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const expRaw = payload.exp;
  const exp = typeof expRaw === "number" && Number.isFinite(expRaw) ? expRaw : null;
  if (exp == null) return { ok: false, error: "missing_exp" };
  if (nowSec >= exp) return { ok: false, error: "expired" };

  return { ok: true, payload };
}
