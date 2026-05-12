import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import FormatBreakdownChart from "../components/content-lab/FormatBreakdownChart";
import AlgorithmScorePanel from "../components/content-lab/AlgorithmScorePanel";
import BestTimeHeatmap from "../components/content-lab/BestTimeHeatmap";
import SyncButton from "../components/dashboard/SyncButton";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";

// Adapt algorithm-metrics post shape to PostInsightsDrawer's expected shape.
function adaptAlgoPost(p) {
  if (!p) return null;
  return {
    ig_media_id: p.ig_media_id,
    media_type: p.media_type,
    media_url: p.media_url,
    thumbnail_url: p.thumbnail_url,
    permalink: p.permalink,
    caption: p.caption,
    timestamp: p.timestamp,
  };
}

// Adapt format-breakdown post shape.
function adaptFormatPost(p) {
  if (!p) return null;
  return {
    ig_media_id: p.ig_media_id,
    media_type: p.media_type,
    media_url: p.thumbnail_url,
    thumbnail_url: p.thumbnail_url,
    permalink: p.permalink,
    caption: p.caption_preview,
    timestamp: p.timestamp,
  };
}

export default function ContentLabPage() {
  const [days, setDays] = useState(90);
  const [selectedMedia, setSelectedMedia] = useState(null);

  return (
    <DashboardLayout>
      <PageHeader
        title="Content Lab"
        emoji="🧪"
        subtitle="Discover which formats, times, and styles the algorithm rewards most."
        days={days}
        onDaysChange={setDays}
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <FormatBreakdownChart
              days={days}
              onSelectPost={(p) => setSelectedMedia(adaptFormatPost(p))}
            />
          </div>
          <div className="lg:col-span-5">
            <AlgorithmScorePanel
              days={days}
              onSelectPost={(p) => setSelectedMedia(adaptAlgoPost(p))}
            />
          </div>
        </div>

        <BestTimeHeatmap days={days} />
      </div>

      <PostInsightsDrawer
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </DashboardLayout>
  );
}
