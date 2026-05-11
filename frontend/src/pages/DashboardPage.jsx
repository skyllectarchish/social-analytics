import { useState } from "react";
import Layout from "../components/Layout";
import HeroCards from "../components/dashboard/HeroCards";
import PeriodSelector from "../components/dashboard/PeriodSelector";
import SyncButton from "../components/dashboard/SyncButton";
import EngagementChart from "../components/dashboard/EngagementChart";
import FollowerGrowthChart from "../components/dashboard/FollowerGrowthChart";
import TopPostsTable from "../components/dashboard/TopPostsTable";
import DemographicsPanel from "../components/dashboard/DemographicsPanel";
import StoriesPanel from "../components/dashboard/StoriesPanel";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const [selectedMedia, setSelectedMedia] = useState(null);

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#0a0e27]">Analytics</h1>
            <p className="text-slate-500 text-sm mt-0.5">Track your Instagram performance</p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector days={days} onChange={setDays} />
            <SyncButton />
          </div>
        </div>

        {/* Hero metric cards */}
        <HeroCards days={days} />

        {/* Engagement chart full-width */}
        <EngagementChart days={days} />

        {/* Follower growth + demographics side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-6">
          <FollowerGrowthChart days={days} />
          <DemographicsPanel />
        </div>

        {/* Active stories */}
        <StoriesPanel />

        {/* Top posts table */}
        <TopPostsTable days={days} onSelect={setSelectedMedia} />
      </div>

      {/* Post insights drawer */}
      <PostInsightsDrawer media={selectedMedia} onClose={() => setSelectedMedia(null)} />
    </Layout>
  );
}
