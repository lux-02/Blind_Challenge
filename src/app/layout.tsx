import type { Metadata } from "next";
import "./globals.css";
import "pretendard/dist/web/static/pretendard.css";

export const metadata: Metadata = {
  title: "Blind Challenge",
  description:
    "네이버 블로그 #블챌(주간일기)에서 드러나는 OSINT/개인정보 노출 위험을 시각화하는 보안 진단 MVP.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={[
          "antialiased",
          // App-level baseline theme
          "min-h-dvh bg-[var(--bc-bg)] text-zinc-100 overflow-x-hidden",
        ].join(" ")}
      >
        <div className="relative min-h-dvh">
          <a
            href="#bc-main"
            className={[
              "sr-only bc-focus",
              "focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-50",
              "rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm",
            ].join(" ")}
          >
            본문으로 건너뛰기
          </a>
          <div className="bc-bgfx bc-vignette pointer-events-none absolute inset-0" />
          <div className="bc-gridfx pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="bc-noise pointer-events-none absolute inset-0" />
          <div className="bc-scanlines pointer-events-none absolute inset-0 opacity-25" />
          <div id="bc-main" tabIndex={-1} className="relative">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
