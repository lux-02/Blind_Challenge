"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  DatabaseZap,
  MonitorSmartphone,
  Trash2,
  ScanSearch,
  Bot,
  Radar,
  Route,
} from "lucide-react";
import NaverTargetForm from "@/components/home/NaverTargetForm";
import RetentionPanel from "@/components/home/RetentionPanel";

const container = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
} as const;

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
} as const;

function badgeBase() {
  return [
    "inline-flex items-center gap-2 rounded-md border border-[var(--bc-border)] bg-[rgba(255,255,255,0.02)] px-3 py-1",
    "text-xs text-zinc-200 font-mono tracking-[0.12em]",
  ].join(" ");
}

export default function HomeLanding() {
  const heroBadges = useMemo(
    () => [
      { icon: ScanSearch, label: "블챌 카테고리 자동 탐지" },
      { icon: Radar, label: "단서 -> 위험 -> 시나리오" },
      { icon: ShieldCheck, label: "서버 DB 저장 없음" },
    ],
    [],
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 pb-16 pt-12 sm:px-10">
      <motion.header
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="inline-flex items-center gap-2 text-xs text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.30)]" />
          Blind Challenge
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 sm:flex">
          <MonitorSmartphone className="h-4 w-4 text-white/80" />
          모바일 공개 게시물 기반
        </div>
      </motion.header>

      <motion.main
        className="flex flex-1 flex-col justify-center pt-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="flex w-full flex-col gap-10">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-200">
              <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.28)]" />
              30초 OSINT 점검
            </div>
            <h1 className="mt-4 max-w-4xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-shadow:0_0_18px_rgba(255,255,255,0.12)] sm:text-5xl">
              소소한 혜택을 챙기려다,
              <br className="hidden sm:block" />
              소중한 일상을 노출하고 있지는 않나요?
            </h1>
            <p className="mt-5 max-w-3xl text-pretty text-base leading-7 text-zinc-200 sm:text-lg">
              AI 에이전트가 공개 게시물에서 단서를 모아, 어떻게 공격 시나리오로
              이어지는지까지 연결해 보여줍니다.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {heroBadges.map((b) => {
                const Icon = b.icon;
                return (
                  <span key={b.label} className={badgeBase()}>
                    <Icon className="h-4 w-4 text-white/90" />
                    {b.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="w-full">
            <div className="relative rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.22),rgba(255,255,255,0.05),rgba(0,0,0,0))] p-[1px]">
              <div className="relative rounded-2xl border border-[var(--bc-border)]/90 bg-[rgba(255,255,255,0.03)] p-5 backdrop-blur-sm sm:p-7">
                <div className="pointer-events-none absolute -inset-0.5 rounded-3xl opacity-70 blur-2xl [background:radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.22),rgba(255,255,255,0.06),transparent_70%)]" />
                <div className="pointer-events-none absolute inset-0 rounded-3xl [background:radial-gradient(900px_circle_at_50%_10%,rgba(255,255,255,0.12),transparent_55%)]" />
                <div className="relative">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="font-mono text-[11px] tracking-[0.26em] text-white/55">
                        INPUT
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        네이버 ID 또는 블로그 URL
                      </div>
                      <div className="mt-1 text-sm text-zinc-300">
                        붙여넣기 후 Enter. 결과는 브라우저 세션(탭)에만
                        유지됩니다.
                      </div>
                    </div>
                    <div className="hidden rounded-xl border border-white/10 bg-black/20 px-3 py-2 sm:block">
                      <div className="font-mono text-[10px] tracking-[0.18em] text-white/60">
                        SESSION ONLY
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-300">
                        <ShieldCheck className="h-4 w-4 text-white/80" />
                        no DB
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <NaverTargetForm variant="hero" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.section variants={item} className="mt-12 w-full max-w-5xl">
          <div className="relative grid gap-3">
            <div className="pointer-events-none absolute left-[calc(16.6%)] right-[calc(16.6%)] top-7 hidden h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)] sm:block" />

            {[
              {
                n: "1",
                title: "ID 입력",
                desc: "분석할 블로그 식별",
                Icon: Route,
                tint: "rgba(255,255,255,0.06)",
              },
              {
                n: "2",
                title: "AI 스캔",
                desc: "챌린지 카테고리 데이터 추적",
                Icon: Bot,
                tint: "rgba(255,255,255,0.08)",
              },
              {
                n: "3",
                title: "리스크 확인",
                desc: "공격 시나리오 + 개선 가이드",
                Icon: Radar,
                tint: "rgba(255,255,255,0.10)",
              },
            ].map(({ n, title, desc, Icon, tint }) => (
              <div
                key={n}
                className="relative z-10 rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10"
                    style={{ background: tint }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="mt-1 text-sm font-semibold text-white">
                      {n}. {title}
                    </div>
                    <div className="mt-1 text-sm text-zinc-300">{desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section variants={item} className="mt-14 w-full max-w-5xl">
          <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02),rgba(0,0,0,0.0))] p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-zinc-400">Security & Trust</div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                  Security First
                </h2>
                <p className="mt-2 text-sm text-zinc-300">
                  분석 데이터는 서버에 저장되지 않으며, 결과는 세션 스토리지에만
                  유지되어 즉시 삭제 가능합니다.
                </p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 sm:flex">
                <ScanSearch className="h-4 w-4 text-white/80" />
                Privacy-aware UX
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <ul className="grid gap-3 text-sm text-zinc-200">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                    <DatabaseZap className="h-5 w-5 text-white/80" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      No Database
                    </div>
                    <div className="mt-1 text-sm text-zinc-300">
                      서버 DB에 어떤 데이터도 저장하지 않습니다.
                    </div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                    <MonitorSmartphone className="h-5 w-5 text-white/80" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Local Session
                    </div>
                    <div className="mt-1 text-sm text-zinc-300">
                      결과는 오직 브라우저 세션(탭)에만 남습니다.
                    </div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                    <Trash2 className="h-5 w-5 text-white/80" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Instant Delete{" "}
                      <span className="text-xs text-zinc-400">(서버)</span>
                    </div>
                    <div className="mt-1 text-sm text-zinc-300">
                      원문은 요청 처리 후 즉시 폐기합니다.
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </motion.section>

        <motion.section variants={item} className="mt-12 w-full max-w-5xl">
          <details className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <summary className="cursor-pointer select-none text-sm font-semibold text-white">
              이어보기 / 재점검 / 공유
              <span className="ml-2 align-middle text-xs font-normal text-zinc-400"></span>
            </summary>
            <p className="mt-2 text-sm text-zinc-300">
              분석 결과를 다시 열고, 2주 후 재점검을 예약하고, 공유 문구로
              주변도 점검을 유도할 수 있어요.
            </p>
            <div className="mt-4">
              <RetentionPanel />
            </div>
          </details>
        </motion.section>
      </motion.main>

      <motion.footer
        className="mt-14 text-center text-xs text-zinc-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.45 }}
      >
        Blind Challenge MVP. 공개 정보 기반 위험 인식 도구이며, 실제 공격을
        조장하지 않습니다.
      </motion.footer>
    </div>
  );
}
