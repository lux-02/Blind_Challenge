"use client";

import Tabs from "@/components/ui/Tabs";

export type ReportTab = "overview" | "graph" | "evidence" | "training";

export default function ReportTabs(props: {
  tab: ReportTab;
  onChange: (t: ReportTab) => void;
}) {
  const { tab, onChange } = props;
  return (
    <Tabs
      value={tab}
      onChange={onChange}
      items={[
        { value: "overview", label: "Overview" },
        { value: "graph", label: "Graph" },
        { value: "evidence", label: "Evidence" },
        { value: "training", label: "Training" },
      ]}
    />
  );
}

