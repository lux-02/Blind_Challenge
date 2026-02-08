import ReportClient from "@/components/report/ReportClient";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const sp = await searchParams;
  const blogId = sp.blogId ?? "";
  return <ReportClient blogId={blogId} />;
}

