import { lazy, Suspense, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
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

// Backend endpoints disagree on field names: algorithm-metrics rows ship
// `caption` + a real `media_url`, while format-breakdown rows ship
// `caption_preview` and no separate media URL. Normalize both into the
// PostInsightsDrawer's expected shape via a single adapter with a flag.
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
      <PageHeader
        title="Content Lab"
        emoji="🧪"
        subtitle="Discover which formats, times, and styles the algorithm rewards most."
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <FormatBreakdownChart
              onSelectPost={(p) => setSelectedMedia(adaptFormatPost(p))}
            />
          </div>
          <div className="lg:col-span-5">
            <AlgorithmScorePanel
              onSelectPost={(p) => setSelectedMedia(adaptAlgoPost(p))}
            />
          </div>
        </div>

        <BestTimeHeatmap />

        <div className="pt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <span>#</span> Hashtags
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
            <div className="lg:col-span-5">
              <HashtagPerformanceTable
                selected={selectedTag}
                onSelect={setSelectedTag}
              />
            </div>
            <div className="lg:col-span-7">
              <HashtagTrendChart tag={selectedTag} />
            </div>
          </div>
          <HashtagComboHeatmap />
          <div className="mt-4">
            <BrandedHashtagsPanel />
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
