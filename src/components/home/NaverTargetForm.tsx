"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

type Props = {
  variant?: "default" | "hero";
};

type OwnershipChallenge = {
  blogId: string;
  nonce: string;
  challengeToken: string;
  expiresAt: string;
  expiresInSec: number;
};

function normalizeInput(raw: string) {
  return raw.trim();
}

function parseBlogId(input: string): { blogId?: string; reason?: string } {
  const v = normalizeInput(input);
  if (!v) return { reason: "네이버 ID 또는 블로그 URL을 입력해주세요." };

  // If user entered a plain ID.
  if (!v.includes("/") && !v.includes(".") && !v.includes(" ")) {
    return { blogId: v };
  }

  // Try URL parsing.
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);

    // blogId query
    const q = u.searchParams.get("blogId");
    if (q) return { blogId: q };

    // https://blog.naver.com/{id}
    // https://m.blog.naver.com/{id}
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length >= 1) {
      // Special-case: /PostView.naver with blogId query handled above
      const first = segments[0];
      if (first && first !== "PostView.naver") return { blogId: first };
    }

    return {
      reason:
        "URL에서 네이버 ID를 추출하지 못했어요. 네이버 ID만 입력해 주세요.",
    };
  } catch {
    return {
      reason:
        "형식이 올바르지 않아요. 네이버 ID만 입력하거나, 블로그 URL을 다시 확인해 주세요.",
    };
  }
}

export default function NaverTargetForm({ variant = "default" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [challenge, setChallenge] = useState<OwnershipChallenge | null>(null);
  const [copied, setCopied] = useState(false);

  const helper = useMemo(() => {
    const v = normalizeInput(value);
    if (!v)
      return "예) 블로그아이디 또는 https://m.blog.naver.com/블로그아이디";
    return challenge
      ? "소개글에 인증 코드를 입력/저장한 뒤 인증 버튼을 눌러 주세요."
      : "Enter로 인증 코드를 발급할 수 있어요.";
  }, [challenge, value]);

  async function requestChallenge() {
    if (busy) return;
    if (!consent) {
      setError("분석을 진행하려면 안내에 동의해 주세요.");
      return;
    }
    const { blogId, reason } = parseBlogId(value);
    if (!blogId) {
      setError(reason ?? "입력을 확인해 주세요.");
      return;
    }

    setError(null);
    setCopied(false);
    setBusy(true);
    try {
      const res = await fetch("/api/naver/ownership/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blogId }),
      });
      const json = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const retryAfterMs =
          json && typeof json === "object" && typeof (json as { retryAfterMs?: unknown }).retryAfterMs === "number"
            ? (json as { retryAfterMs: number }).retryAfterMs
            : null;
        const message =
          json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
            ? (json as { message: string }).message
            : null;

        if (res.status === 429 && typeof retryAfterMs === "number") {
          setError(
            `요청이 잠시 제한되었어요. ${Math.ceil(retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
          );
          return;
        }
        setError(message && message.trim() ? message : "인증 코드 발급에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      if (!json || typeof json !== "object") {
        setError("인증 코드 응답이 올바르지 않아요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const next = json as Partial<OwnershipChallenge>;
      if (
        typeof next.blogId !== "string" ||
        typeof next.nonce !== "string" ||
        typeof next.challengeToken !== "string" ||
        typeof next.expiresAt !== "string" ||
        typeof next.expiresInSec !== "number"
      ) {
        setError("인증 코드 응답이 올바르지 않아요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      setChallenge(next as OwnershipChallenge);
    } catch {
      setError("인증 코드 발급에 실패했어요. 네트워크 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOwnership() {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/naver/ownership/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blogId: challenge.blogId,
          challengeToken: challenge.challengeToken,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; reason?: string }
        | null;

      if (!res.ok) {
        if (res.status === 401) {
          setError("인증 코드가 만료되었어요. 새 코드를 발급받아 다시 진행해 주세요.");
          return;
        }
        setError(
          typeof json?.message === "string" && json.message
            ? json.message
            : "소유권 인증에 실패했어요. 소개글 저장 여부를 확인해 주세요.",
        );
        return;
      }

      router.push(`/analysis?blogId=${encodeURIComponent(challenge.blogId)}`);
    } catch {
      setError("소유권 인증 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function clearChallenge() {
    setChallenge(null);
    setCopied(false);
  }

  async function copyNonce() {
    if (!challenge?.nonce) return;
    try {
      await navigator.clipboard.writeText(challenge.nonce);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  function submit() {
    void requestChallenge();
  }

  return (
    <form
      className={variant === "hero" ? "space-y-4" : "space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div
        className={
          variant === "hero"
            ? "flex flex-col gap-3"
            : "flex flex-col gap-3 sm:flex-row"
        }
      >
        <div>
          <label className="sr-only" htmlFor="naverId">
            네이버 ID 또는 블로그 URL
          </label>
          <input
            id="naverId"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (challenge) clearChallenge();
              if (error) setError(null);
            }}
            placeholder="예) 블로그아이디 또는 URL"
            className={[
              "bc-focus w-full border outline-none transition",
              "border-[var(--bc-border)] bg-black/20 text-white placeholder:text-zinc-500",
              "focus:border-[var(--bc-accent)]",
              variant === "hero"
                ? "rounded-2xl px-5 py-4 text-base shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_40px_rgba(255,255,255,0.10)]"
                : "rounded-xl px-4 py-3 text-sm",
            ].join(" ")}
            autoComplete="off"
            inputMode="url"
            onFocus={() => {
              if (typeof document !== "undefined") {
                document.documentElement.dataset.bcInputFocus = "1";
              }
            }}
            onBlur={() => {
              if (typeof document !== "undefined") {
                delete document.documentElement.dataset.bcInputFocus;
              }
            }}
          />
          <div className="mt-2 text-xs text-zinc-400">{helper}</div>

          <div className="mt-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <span className="inline-flex items-center justify-center">
                <input
                  type="checkbox"
                  className={[
                    // Native checkbox keeps the checkmark visible; tune it to the monochrome HUD palette.
                    "h-3 w-3 rounded-[3px]",
                    "accent-[rgba(255,255,255,0.78)]",
                    "opacity-70",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,255,255,0.14)]",
                  ].join(" ")}
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (error) setError(null);
                  }}
                />
              </span>
              <span className="leading-5">
                공개 게시물 수집·분석에 동의합니다 (결과는 세션(탭)에만 유지)
              </span>
            </label>
            <details className="mt-1 text-xs text-zinc-500">
              <summary className="cursor-pointer text-zinc-500">
                개인정보 처리 안내(요약)
              </summary>
              <div className="mt-2 space-y-2 leading-6">
                <div>
                  1) 수집 범위: 공개 게시물 본문 텍스트, 발행일, 이미지
                  URL(미리보기)
                </div>
                <div>
                  2) 처리 목적: 단서 탐지, 위험도 리포트 제공(보안 인식/예방
                  목적)
                </div>
                <div>
                  3) 보관 정책: 서버 DB 저장 없음, 결과는 브라우저
                  세션(탭)에서만 유지
                </div>
                <div>
                  4) 유의: 비공개 글/성인 인증/봇 차단 등으로 수집이 실패할 수
                  있음
                </div>
              </div>
            </details>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/90">
              {error}
            </div>
          ) : null}

          {challenge ? (
            <div className="mt-3 rounded-xl border border-white/20 bg-white/5 px-4 py-4 text-sm text-zinc-100">
              <div className="text-sm font-semibold text-white">소유권 인증 코드</div>
              <div className="mt-2 text-xs leading-5 text-zinc-300">
                1) 블로그 소개글에 아래 코드를 붙여넣고 저장하세요.
                <br />
                2) 저장 후 <span className="font-semibold text-white">인증 후 분석 시작</span>을 누르세요.
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-lg border border-white/25 bg-black/30 px-3 py-2 font-mono text-sm text-white">
                  {challenge.nonce}
                </code>
                <Button type="button" variant="ghost" size="sm" onClick={copyNonce}>
                  {copied ? "복사됨" : "코드 복사"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void requestChallenge()}
                >
                  코드 재발급
                </Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void verifyOwnership()}
                >
                  {busy ? "인증 중…" : "인증 후 분석 시작"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={clearChallenge}>
                  취소
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                코드 유효시간은 약 {Math.max(1, Math.ceil(challenge.expiresInSec / 60))}분입니다.
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={
            variant === "hero" ? "grid gap-2" : "grid gap-2 sm:w-[220px]"
          }
        >
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            className={variant === "hero" ? "w-full" : undefined}
          >
            {busy ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                처리 중…
              </>
            ) : (
              challenge ? "코드 재발급" : "인증 코드 발급"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className={variant === "hero" ? "w-full" : undefined}
            onClick={() => {
              if (busy) return;
              router.push("/report?blogId=sample&demo=1&tab=overview");
            }}
          >
            샘플 리포트 보기
          </Button>
        </div>
      </div>
    </form>
  );
}
