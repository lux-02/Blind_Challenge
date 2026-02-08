"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import type { BlindReport } from "@/lib/types";
import { notifyStorageChanged, subscribeStorageChanged } from "@/lib/storageBus";

const STORAGE_KEY = "blindchallenge:latestReport";
const REMINDER_KEY = "blindchallenge:recheckReminder";

type Reminder = {
  blogId: string;
  recheckAt: string; // ISO datetime
};

function formatDT(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildShareText(opts: { url?: string | null }) {
  const url = opts.url ?? null;
  const lines = [
    "내 네이버 블로그가 공격자에게 어떻게 보이는지 30초만에 점검해볼 수 있어요.",
    "Blind Challenge: 블챌/주간일기 공개 글의 OSINT 위험 신호를 연결해 보여주는 리포트",
  ];
  if (url) lines.push(url);
  return lines.join("\n");
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function RetentionPanel() {
  const router = useRouter();
  const allowReadRef = useRef(false);

  // Avoid hydration mismatch: server snapshot is always null, so keep the initial
  // client render consistent and only start reading storage after mount.
  useEffect(() => {
    allowReadRef.current = true;
    notifyStorageChanged("session", STORAGE_KEY);
    notifyStorageChanged("local", REMINDER_KEY);
  }, []);

  const readSessionRaw = useCallback((): string | null => {
    if (!allowReadRef.current) return null;
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }, []);

  const readReminderRaw = useCallback((): string | null => {
    if (!allowReadRef.current) return null;
    try {
      return localStorage.getItem(REMINDER_KEY);
    } catch {
      return null;
    }
  }, []);

  const reportRaw = useSyncExternalStore(
    subscribeStorageChanged,
    readSessionRaw,
    () => null,
  );
  const reminderRaw = useSyncExternalStore(
    subscribeStorageChanged,
    readReminderRaw,
    () => null,
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const report = useMemo(() => {
    if (!reportRaw) return null;
    try {
      return JSON.parse(reportRaw) as BlindReport;
    } catch {
      return null;
    }
  }, [reportRaw]);

  const reminder = useMemo(() => {
    if (!reminderRaw) return null;
    try {
      return JSON.parse(reminderRaw) as Reminder;
    } catch {
      return null;
    }
  }, [reminderRaw]);

  const resumeBlogId = report?.blogId ?? null;
  const risk = typeof report?.riskScore === "number" ? report.riskScore : null;
  const riskLabel =
    risk == null
      ? "부분 리포트"
      : risk >= 75
        ? "높음"
        : risk >= 45
          ? "주의"
          : "낮음";

  const riskColor =
    risk == null
      ? "text-zinc-200"
      : risk >= 75
        ? "text-white"
        : risk >= 45
          ? "text-zinc-100"
          : "text-zinc-200";

  const sharePreview = useMemo(() => buildShareText({ url: null }), []);

  return (
    <section className="mt-6 grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">리포트 이어보기</h3>
          {resumeBlogId ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
              session
            </span>
          ) : null}
        </div>
        {resumeBlogId ? (
          <>
            <div className="mt-3 text-xs text-zinc-400">최근 분석 대상</div>
            <div className="mt-1 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-zinc-200">
                  {resumeBlogId}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  생성: {formatDT(report?.generatedAt)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-zinc-400">risk</div>
                <div className={["font-mono text-sm font-semibold", riskColor].join(" ")}>
                  {risk == null ? "-" : `${clamp(risk, 0, 100)}`}
                  {risk == null ? "" : "/100"}
                </div>
                <div className="text-[10px] text-zinc-400">{riskLabel}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() =>
                  router.push(`/report?blogId=${encodeURIComponent(resumeBlogId)}`)
                }
                className="rounded-xl bg-[var(--bc-accent)] px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
              >
                리포트 열기
              </button>
              <button
                onClick={() =>
                  router.push(`/analysis?blogId=${encodeURIComponent(resumeBlogId)}`)
                }
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                다시 점검(새로 분석)
              </button>
              <button
                onClick={() => {
                  try {
                    sessionStorage.removeItem(STORAGE_KEY);
                    notifyStorageChanged("session", STORAGE_KEY);
                  } catch {
                    // ignore
                  }
                  setToast("세션 리포트를 지웠어요.");
                }}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-white/20"
              >
                리포트 지우기
              </button>
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
            아직 저장된 리포트가 없어요. 한 번 분석하면 여기에서 바로 이어볼 수 있어요.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-white">다음 글 올리기 전, 다시 점검</h3>
        <p className="mt-2 text-sm text-zinc-300">
          블챌 글이 쌓일수록 단서도 쌓입니다.{" "}
          <span className="font-semibold text-white">2주 후</span> 한 번 더 점검을 예약해 두세요.
        </p>

        {reminder?.blogId ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">대상</span>
              <span className="font-mono text-zinc-200">{reminder.blogId}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-zinc-400">예약</span>
              <span className="font-mono text-zinc-200">{formatDT(reminder.recheckAt)}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => {
              const blogId = resumeBlogId;
              if (!blogId) {
                setToast("먼저 한 번 분석하면 대상 ID로 예약할 수 있어요.");
                return;
              }
              const recheckAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
              const next: Reminder = { blogId, recheckAt };
              try {
                localStorage.setItem(REMINDER_KEY, JSON.stringify(next));
                notifyStorageChanged("local", REMINDER_KEY);
              } catch {
                // ignore
              }
              setToast("2주 후 재점검을 예약했어요.");
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            2주 후 재점검 예약
          </button>
          {reminder ? (
            <button
              onClick={() => {
                try {
                  localStorage.removeItem(REMINDER_KEY);
                  notifyStorageChanged("local", REMINDER_KEY);
                } catch {
                  // ignore
                }
                setToast("재점검 예약을 취소했어요.");
              }}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-white/20"
            >
              예약 취소
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-white">내 친구도 안전한지 알려주기</h3>
        <p className="mt-2 text-sm text-zinc-300">
          내 블로그만 안전해도, 주변이 취약하면 사칭/연결고리가 생길 수 있어요.
          간단한 문구로 공유해 보세요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={async () => {
              try {
                const url =
                  typeof window !== "undefined" ? window.location.origin : null;
                await copyText(buildShareText({ url }));
                setToast("공유 문구를 복사했어요.");
              } catch {
                setToast("복사에 실패했어요.");
              }
            }}
            className="rounded-xl bg-[var(--bc-accent)] px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            공유 문구 복사(친구에게 보내기)
          </button>
          <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-[11px] leading-5 text-zinc-300">
            {sharePreview}
          </div>
          <div className="text-[11px] text-zinc-500">
            로컬 데모에서는 주소가 `localhost`로 표시됩니다. 배포 후 도메인 문구만 바꾸면 돼요.
          </div>
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2">
          <div className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-center text-sm text-zinc-100 backdrop-blur-sm">
            {toast}
          </div>
        </div>
      ) : null}
    </section>
  );
}
