"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

type Props = {
  variant?: "default" | "hero";
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

  const helper = useMemo(() => {
    const v = normalizeInput(value);
    if (!v)
      return "예) 블로그아이디 또는 https://m.blog.naver.com/블로그아이디";
    return "Enter로 제출할 수 있어요.";
  }, [value]);

  function submit() {
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
    setBusy(true);

    // Keep it simple: route to analysis with blogId.
    router.push(`/analysis?blogId=${encodeURIComponent(blogId)}`);
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
                이동 중…
              </>
            ) : (
              "위험도 분석하기"
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
