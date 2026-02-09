import ReportClient from "@/components/report/ReportClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "네이버 블로그 OSINT - 위험 리포트",
  description:
    "수집된 단서를 바탕으로 개인정보·생활패턴 노출 위험을 점수화하고, 공격 시나리오 그래프와 근거(Evidence)를 함께 제공합니다. 결과는 브라우저 세션에만 저장됩니다.",
  alternates: { canonical: "/report" },
  openGraph: {
    url: "/report",
    title: "네이버 블로그 OSINT - 위험 리포트",
    description:
      "단서 기반으로 위험을 점수화하고, 공격 시나리오 그래프와 근거(Evidence)를 함께 제공합니다. 결과는 브라우저 세션에만 저장됩니다.",
  },
  twitter: {
    title: "네이버 블로그 OSINT - 위험 리포트",
    description:
      "단서 기반으로 위험을 점수화하고, 공격 시나리오 그래프와 근거(Evidence)를 함께 제공합니다. 결과는 브라우저 세션에만 저장됩니다.",
  },
};

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const sp = await searchParams;
  const blogId = sp.blogId ?? "";
  return <ReportClient blogId={blogId} />;
}
