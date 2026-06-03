import { lazy, Suspense, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import LabStatStrip from "../components/content-lab/LabStatStrip";
import FormatBreakdownChart from "../components/content-lab/FormatBreakdownChart";
import AlgorithmScorePanel from "../components/content-lab/AlgorithmScorePanel";
import BestTimeHeatmap from "../components/content-lab/BestTimeHeatmap";
import HashtagPerformanceTable from "../components/content-lab/HashtagPerformanceTable";
import HashtagTrendChart from "../components/content-lab/HashtagTrendChart";
import HashtagComboHeatmap from "../components/content-lab/HashtagComboHeatmap";
import BrandedHashtagsPanel from "../components/content-lab/BrandedHashtagsPanel";
import SyncButton from "../components/dashboard/SyncButton";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";

const PostDiagnosticDrawer = lazy(() =>
  import("../components/copilot/PostDiagnosticDrawer"),
);

function adaptPostForDrawer(p, { preview = false } = {}) {
  if (!p) return null;
  return {
    ig_media_id: p.ig_media_id,
    media_type: p.media_type,
    media_url: preview ? p.thumbnail_url : p.media_url,
    thumbnail_url: p.thumbnail_url,
    permalink: p.permalink,
    caption: preview ? p.caption_preview : p.caption,
    timestamp: p.timestamp,
  };
}

const adaptAlgoPost = (p) => adaptPostForDrawer(p);
const adaptFormatPost = (p) => adaptPostForDrawer(p, { preview: true });

export default function ContentLabPage() {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [diagnosticMedia, setDiagnosticMedia] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);

  return (
    <DashboardLayout>
      <div className="lab-grid">
        <PageHeader
          title="Content Lab"
          subtitle="Which formats, times, and styles the algorithm rewards most."
          actions={<SyncButton />}
        />

        <div className="space-y-3">
          <LabStatStrip />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {/* Left: format performance + timing */}
            <div className="space-y-3">
              <FormatBreakdownChart
                onSelectPost={(p) => setSelectedMedia(adaptFormatPost(p))}
              />
              <BestTimeHeatmap />
            </div>

            {/* Right: algorithm score + hashtags */}
            <div className="space-y-3">
              <AlgorithmScorePanel
                onSelectPost={(p) => setSelectedMedia(adaptAlgoPost(p))}
              />
              <div className="grid grid-cols-[2fr_3fr] gap-3">
                <HashtagPerformanceTable
                  selected={selectedTag}
                  onSelect={setSelectedTag}
                />
                <HashtagTrendChart tag={selectedTag} />
              </div>
              <HashtagComboHeatmap />
              <BrandedHashtagsPanel />
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
