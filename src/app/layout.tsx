import type { Metadata, Viewport } from "next";
import "./globals.css";
import "pretendard/dist/web/static/pretendard.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "네이버 블로그 OSINT 위험 진단 | Blind Challenge",
    template: "%s | Blind Challenge",
  },
  description:
    "네이버 블로그 공개 글(블챌/주간일기)에서 개인정보·생활패턴 노출 단서를 찾아 위험 요소와 공격 시나리오로 연결해 시각화하는 OSINT 보안 진단 도구.",
  openGraph: {
    type: "website",
    siteName: "Blind Challenge",
    locale: "ko_KR",
    title: "네이버 블로그 OSINT 위험 진단 | Blind Challenge",
    description:
      "네이버 블로그 공개 글(블챌/주간일기)에서 개인정보·생활패턴 노출 단서를 찾아 위험 요소와 공격 시나리오로 연결해 시각화합니다.",
    url: "/",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "네이버 블로그 OSINT 위험 진단 | Blind Challenge",
    description:
      "네이버 블로그 공개 글(블챌/주간일기) 기반 OSINT 위험 신호를 단서 -> 위험 -> 공격 시나리오로 연결해 보여주는 보안 진단 도구.",
    images: ["/twitter-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png" }],
  },
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
