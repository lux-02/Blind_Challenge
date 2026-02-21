function parseRetryAfterToMs(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;

  // Retry-After can be seconds or an HTTP-date.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const sec = Number(trimmed);
    if (!Number.isFinite(sec)) return null;
    return Math.max(0, Math.round(sec * 1000));
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, d.getTime() - Date.now());
}

function parseResetToMs(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;

  // Common patterns: "1s", "250ms"
  const m = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s)$/i);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    const unit = m[2]!.toLowerCase();
    return unit === "ms" ? Math.round(n) : Math.round(n * 1000);
  }

  // Sometimes it's a timestamp-like number (seconds).
  if (/^\d{9,}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    // Heuristic: treat as seconds if small, else ms.
    const ms = n < 10_000_000_000 ? n * 1000 : n;
    return Math.max(0, Math.round(ms - Date.now()));
  }

  return null;
}

export function getRetryAfterMs(headers: Headers, fallbackMs = 5000): number {
  const ra = headers.get("retry-after");
  const fromRetryAfter = ra ? parseRetryAfterToMs(ra) : null;
  if (typeof fromRetryAfter === "number") return Math.max(0, fromRetryAfter);

  // OpenAI sometimes includes rate-limit reset headers.
  const reset =
    headers.get("x-ratelimit-reset-tokens") ??
    headers.get("x-ratelimit-reset-requests") ??
    headers.get("x-ratelimit-reset");
  const fromReset = reset ? parseResetToMs(reset) : null;
  if (typeof fromReset === "number") return Math.max(0, fromReset);

  return fallbackMs;
}

type RateBucket = {
  count: number;
  resetAt: number;
};

const RATE_BUCKETS = new Map<string, RateBucket>();
const MAX_BUCKETS = 8000;

function pruneBuckets(nowMs: number) {
  if (RATE_BUCKETS.size <= MAX_BUCKETS) return;
  for (const [k, v] of RATE_BUCKETS) {
    if (v.resetAt <= nowMs) RATE_BUCKETS.delete(k);
    if (RATE_BUCKETS.size <= MAX_BUCKETS) break;
  }
}

export function checkInMemoryRateLimit(opts: {
  namespace: string;
  key: string;
  windowMs: number;
  limit: number;
  nowMs?: number;
}): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
} {
  const nowMs = opts.nowMs ?? Date.now();
  const windowMs = Math.max(1_000, Math.floor(opts.windowMs));
  const limit = Math.max(1, Math.floor(opts.limit));
  const bucketKey = `${opts.namespace}:${opts.key}`;

  pruneBuckets(nowMs);

  const existing = RATE_BUCKETS.get(bucketKey);
  if (!existing || existing.resetAt <= nowMs) {
    const resetAt = nowMs + windowMs;
    RATE_BUCKETS.set(bucketKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterMs: 0,
      resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - nowMs),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  RATE_BUCKETS.set(bucketKey, existing);
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterMs: 0,
    resetAt: existing.resetAt,
  };
}
