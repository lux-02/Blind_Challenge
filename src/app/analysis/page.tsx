import AnalysisClient from "@/components/analysis/AnalysisClient";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const sp = await searchParams;
  const blogId = sp.blogId ?? "";
  return <AnalysisClient blogId={blogId} />;
}

