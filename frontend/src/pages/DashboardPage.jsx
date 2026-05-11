import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import HeroCards from "../components/dashboard/HeroCards";
import PeriodSelector from "../components/dashboard/PeriodSelector";
import SyncButton from "../components/dashboard/SyncButton";
import EngagementChart from "../components/dashboard/EngagementChart";
import FollowerGrowthChart from "../components/dashboard/FollowerGrowthChart";
import TopPostsGrid from "../components/dashboard/TopPostsGrid";
import DemographicsPanel from "../components/dashboard/DemographicsPanel";
import StoriesPanel from "../components/dashboard/StoriesPanel";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import { useOverview } from "../hooks/useInsights";

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const { data: overview } = useOverview(days);

  const sparklines = {
    total_views: (overview?.views?.data ?? []).map((d) => ({ v: d.value })),
    total_reach: (overview?.reach?.data ?? []).map((d) => ({ v: d.value })),
    total_interactions: (overview?.total_interactions?.data ?? []).map((d) => ({ v: d.value })),
    net_follower_growth: (overview?.follows_and_unfollows?.data ?? []).map((d) => ({ v: d.value })),
  };

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1
            className="font-display text-3xl font-semibold"
            style={{ color: "#0F172A", letterSpacing: "-0.025em" }}
          >
            Creator Analytics
          </h1>
          <p style={{ color: "#475569", fontSize: 13, marginTop: 3 }}>
            Instagram performance — last {days} days
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector days={days} onChange={setDays} />
          <SyncButton />
        </div>
      </div>

      {/* Bento grid */}
      <div className="space-y-4">
        {/* Row 1: Hero metric cards */}
        <HeroCards days={days} sparklines={sparklines} />

        {/* Row 2: Engagement chart + Follower growth */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8">
            <EngagementChart days={days} />
          </div>
          <div className="lg:col-span-4">
            <FollowerGrowthChart days={days} />
          </div>
        </div>

        {/* Row 3: Top posts grid + Demographics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <TopPostsGrid days={days} onSelect={setSelectedMedia} />
          </div>
          <div className="lg:col-span-7">
            <DemographicsPanel />
          </div>
        </div>

        {/* Row 4: Active stories */}
        <StoriesPanel />
      </div>

      <PostInsightsDrawer media={selectedMedia} onClose={() => setSelectedMedia(null)} />
    </DashboardLayout>
  );
}
