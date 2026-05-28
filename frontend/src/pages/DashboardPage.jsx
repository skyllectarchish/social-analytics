import { lazy, Suspense, useMemo, useState } from "react";
import { Activity, Users, Radio } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import { SectionDivider } from "../components/shared/SectionCard";
import HeroCards from "../components/dashboard/HeroCards";
import SyncButton from "../components/dashboard/SyncButton";
import EngagementChart from "../components/dashboard/EngagementChart";
import FollowerGrowthChart from "../components/dashboard/FollowerGrowthChart";
import TopPostsGrid from "../components/dashboard/TopPostsGrid";
import DemographicsPanel from "../components/dashboard/DemographicsPanel";
import StoriesPanel from "../components/dashboard/StoriesPanel";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import { useOverview } from "../hooks/useInsights";

const PostDiagnosticDrawer = lazy(() =>
  import("../components/copilot/PostDiagnosticDrawer"),
);

export default function DashboardPage() {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [diagnosticMedia, setDiagnosticMedia] = useState(null);
  const { data: overview } = useOverview();

  // Memoize so a parent re-render doesn't hand HeroCards fresh array refs and
  // cascade re-renders through every memoized card child.
  const sparklines = useMemo(
    () => ({
      total_views: (overview?.views?.data ?? []).map((d) => ({ v: d.value })),
      total_reach: (overview?.reach?.data ?? []).map((d) => ({ v: d.value })),
      total_interactions: (overview?.total_interactions?.data ?? []).map((d) => ({ v: d.value })),
      net_follower_growth: (overview?.follows_and_unfollows?.data ?? []).map((d) => ({ v: d.value })),
    }),
    [overview],
  );

  return (
    <DashboardLayout>
      <div className="lab-grid">
        <PageHeader
          title="Creator Analytics"
          subtitle="Instagram performance across your selected period."
          actions={<SyncButton />}
        />

        <div className="space-y-9">
          <HeroCards sparklines={sparklines} />

          <section className="space-y-4">
            <SectionDivider icon={Activity} title="Performance Overview" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8">
                <EngagementChart />
              </div>
              <div className="lg:col-span-4">
                <FollowerGrowthChart />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionDivider icon={Users} title="Audience & Top Content" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5">
                <TopPostsGrid onSelect={setSelectedMedia} />
              </div>
              <div className="lg:col-span-7">
                <DemographicsPanel />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionDivider icon={Radio} title="Live Stories" />
            <StoriesPanel />
          </section>
        </div>
      </div>

      <PostInsightsDrawer
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        onDiagnose={(m) => {
          setSelectedMedia(null);
          setDiagnosticMedia(m);
        }}
      />
      {/* Only mount the lazy drawer once the user actually triggers it, so
          the chunk fetch waits until the click rather than on every page mount. */}
      {diagnosticMedia && (
        <Suspense fallback={null}>
          <PostDiagnosticDrawer media={diagnosticMedia} onClose={() => setDiagnosticMedia(null)} />
        </Suspense>
      )}
    </DashboardLayout>
  );
}
