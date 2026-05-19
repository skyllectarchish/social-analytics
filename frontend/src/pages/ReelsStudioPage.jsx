import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import ReelsHeroMetrics from "../components/reels-studio/ReelsHeroMetrics";
import HookStrengthTrend from "../components/reels-studio/HookStrengthTrend";
import ReelsRetentionTable from "../components/reels-studio/ReelsRetentionTable";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import SyncButton from "../components/dashboard/SyncButton";

export default function ReelsStudioPage() {
  const [selectedMedia, setSelectedMedia] = useState(null);

  return (
    <DashboardLayout>
      <PageHeader
        title="Reels Studio"
        emoji="🎬"
        subtitle="Track hook strength, watch time, and retention across all your Reels."
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        <ReelsHeroMetrics />
        <HookStrengthTrend />
        <ReelsRetentionTable onSelect={setSelectedMedia} />
      </div>

      <PostInsightsDrawer
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </DashboardLayout>
  );
}
