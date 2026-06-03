import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import CompetitorListPanel from "../components/competitors/CompetitorListPanel";
import CompetitorMetricsTable from "../components/competitors/CompetitorMetricsTable";
import CompetitorTimelineChart from "../components/competitors/CompetitorTimelineChart";
import ContentMixChart from "../components/competitors/ContentMixChart";
import AddCompetitorDialog from "../components/competitors/AddCompetitorDialog";
import SyncButton from "../components/dashboard/SyncButton";

export default function CompetitorsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <DashboardLayout>
      <PageHeader
        title="Competitors"
        subtitle="Public benchmarks across accounts in your niche."
        actions={<SyncButton />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-3 items-start">
        {/* Left: list + content mix */}
        <div className="space-y-3">
          <CompetitorListPanel onAdd={() => setAddOpen(true)} />
          <ContentMixChart />
        </div>

        {/* Right: metrics table + timeline */}
        <div className="space-y-3">
          <CompetitorMetricsTable />
          <CompetitorTimelineChart />
        </div>
      </div>

      <AddCompetitorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </DashboardLayout>
  );
}
