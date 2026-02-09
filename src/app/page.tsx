import HomeLanding from "@/components/home/HomeLanding";
import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  title: "네이버 블로그 OSINT 위험 진단",
  description:
    "네이버 블로그 공개 글(블챌/주간일기)에서 개인정보·생활패턴 노출 단서를 찾아 위험 요소와 공격 시나리오로 연결해 시각화합니다. 결과는 브라우저 세션에만 저장됩니다.",
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "네이버 블로그 OSINT 위험 진단",
    description:
      "네이버 블로그 공개 글(블챌/주간일기)에서 개인정보·생활패턴 노출 단서를 찾아 위험 요소와 공격 시나리오로 연결해 시각화합니다.",
  },
  twitter: {
    title: "네이버 블로그 OSINT 위험 진단",
    description:
      "네이버 블로그 공개 글(블챌/주간일기) 기반 OSINT 위험 신호를 단서 -> 위험 -> 공격 시나리오로 연결해 보여줍니다.",
  },
};

export default function HomePage() {
  const logoUrl = new URL("/icon.png", SITE_URL).toString();
  const pageUrl = new URL("/", SITE_URL).toString();

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Blind Challenge",
      url: pageUrl,
      logo: logoUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Blind Challenge",
      url: pageUrl,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // Next App Router: plain script tag is fine for JSON-LD (no runtime needed).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeLanding />
    </>
  );
}
