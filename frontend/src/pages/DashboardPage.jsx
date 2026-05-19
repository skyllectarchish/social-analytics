import { useState } from "react";
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

export default function DashboardPage() {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const { data: overview } = useOverview();

  const sparklines = {
    total_views: (overview?.views?.data ?? []).map((d) => ({ v: d.value })),
    total_reach: (overview?.reach?.data ?? []).map((d) => ({ v: d.value })),
    total_interactions: (overview?.total_interactions?.data ?? []).map((d) => ({ v: d.value })),
    net_follower_growth: (overview?.follows_and_unfollows?.data ?? []).map((d) => ({ v: d.value })),
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Creator Analytics"
        subtitle="Instagram performance across your selected period."
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        <HeroCards sparklines={sparklines} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8">
            <EngagementChart />
          </div>
          <div className="lg:col-span-4">
            <FollowerGrowthChart />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <TopPostsGrid onSelect={setSelectedMedia} />
          </div>
          <div className="lg:col-span-7">
            <DemographicsPanel />
          </div>
        </div>

        <StoriesPanel />
      </div>

      <PostInsightsDrawer media={selectedMedia} onClose={() => setSelectedMedia(null)} />
    </DashboardLayout>
  );
}
