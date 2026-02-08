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

