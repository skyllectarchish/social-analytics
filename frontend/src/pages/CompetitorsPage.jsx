import { useState } from "react";
import { Users, LineChart, PieChart } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import { SectionDivider } from "../components/shared/SectionCard";
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
      <div className="lab-grid">
        <PageHeader
          title="Competitors"
          emoji="📈"
          subtitle="Track public benchmarks across accounts in your niche."
          actions={<SyncButton />}
        />

        <div className="space-y-9">
          <section className="space-y-4">
            <SectionDivider icon={Users} title="Roster & Snapshot" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4">
                <CompetitorListPanel onAdd={() => setAddOpen(true)} />
              </div>
              <div className="lg:col-span-8">
                <CompetitorMetricsTable />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionDivider icon={LineChart} title="Engagement Timeline" />
            <CompetitorTimelineChart />
          </section>

          <section className="space-y-4">
            <SectionDivider icon={PieChart} title="Content Mix" />
            <ContentMixChart />
          </section>
        </div>
      </div>

      <AddCompetitorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </DashboardLayout>
  );
}
