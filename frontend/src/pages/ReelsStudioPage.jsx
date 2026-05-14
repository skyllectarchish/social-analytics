import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import ReelsHeroMetrics from "../components/reels-studio/ReelsHeroMetrics";
import HookStrengthTrend from "../components/reels-studio/HookStrengthTrend";
import ReelsRetentionTable from "../components/reels-studio/ReelsRetentionTable";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import SyncButton from "../components/dashboard/SyncButton";

export default function ReelsStudioPage() {
  const [days, setDays] = useState(90);
  const [selectedMedia, setSelectedMedia] = useState(null);

  return (
    <DashboardLayout>
      <PageHeader
        title="Reels Studio"
        emoji="🎬"
        subtitle="Track hook strength, watch time, and retention across all your Reels."
        days={days}
        onDaysChange={setDays}
        actions={<SyncButton days={days} />}
      />

      <div className="space-y-4">
        <ReelsHeroMetrics days={days} />
        <HookStrengthTrend days={days} />
        <ReelsRetentionTable days={days} onSelect={setSelectedMedia} />
      </div>

      <PostInsightsDrawer
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </DashboardLayout>
  );
}
