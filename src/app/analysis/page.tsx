import AnalysisClient from "@/components/analysis/AnalysisClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "네이버 블로그 OSINT 분석 - 워크벤치",
  description:
    "네이버 블로그 공개 게시물에서 단서를 수집하고, 위험 요소와 공격 시나리오로 연결해 리포트를 생성합니다. 블챌 카테고리를 자동 탐지하고 다중 카테고리 분석을 지원합니다.",
  alternates: { canonical: "/analysis" },
  openGraph: {
    url: "/analysis",
    title: "네이버 블로그 OSINT 분석 - 워크벤치",
    description:
      "네이버 블로그 공개 게시물에서 단서를 수집하고, 위험 요소와 공격 시나리오로 연결해 리포트를 생성합니다. 블챌 카테고리 자동 탐지/다중 분석 지원.",
  },
  twitter: {
    title: "네이버 블로그 OSINT 분석 - 워크벤치",
    description:
      "네이버 블로그 공개 게시물에서 단서를 수집하고, 위험 요소와 공격 시나리오로 연결해 리포트를 생성합니다. 블챌 카테고리 자동 탐지/다중 분석 지원.",
  },
};

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const sp = await searchParams;
  const blogId = sp.blogId ?? "";
  return <AnalysisClient blogId={blogId} />;
}
