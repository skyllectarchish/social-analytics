import { lazy, Suspense, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
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

        <div className="space-y-3">
          <HeroCards sparklines={sparklines} />

          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3 items-start">
            <div className="space-y-3">
              <EngagementChart />
              <FollowerGrowthChart />
            </div>
            <div className="space-y-3">
              <TopPostsGrid onSelect={setSelectedMedia} />
              <DemographicsPanel />
              <StoriesPanel />
            </div>
          </div>
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
      {diagnosticMedia && (
        <Suspense fallback={null}>
          <PostDiagnosticDrawer media={diagnosticMedia} onClose={() => setDiagnosticMedia(null)} />
        </Suspense>
      )}
    </DashboardLayout>
  );
}
