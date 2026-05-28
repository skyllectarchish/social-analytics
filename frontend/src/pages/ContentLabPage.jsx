import { lazy, Suspense, useState } from "react";
import { BarChart3, Clock, Hash } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import { SectionDivider } from "../components/shared/SectionCard";
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
      <div className="lab-grid">
      <PageHeader
        title="Content Lab"
        subtitle="Discover which formats, times, and styles the algorithm rewards most."
        actions={<SyncButton />}
      />

      <div className="space-y-4">
        <LabStatStrip />

        <section className="space-y-3">
          <SectionDivider icon={BarChart3} title="Content Performance" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-8">
              <FormatBreakdownChart
                onSelectPost={(p) => setSelectedMedia(adaptFormatPost(p))}
              />
            </div>
            <div className="lg:col-span-4">
              <AlgorithmScorePanel
                onSelectPost={(p) => setSelectedMedia(adaptAlgoPost(p))}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <SectionDivider icon={Clock} title="Posting Times" />
          <BestTimeHeatmap />
        </section>

        <section className="space-y-3">
          <SectionDivider icon={Hash} title="Hashtags" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-4">
              <HashtagPerformanceTable
                selected={selectedTag}
                onSelect={setSelectedTag}
              />
            </div>
            <div className="lg:col-span-8">
              <HashtagTrendChart tag={selectedTag} />
            </div>
          </div>
          <HashtagComboHeatmap />
          <BrandedHashtagsPanel />
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
      {diagnosticMedia && (
        <Suspense fallback={null}>
          <PostDiagnosticDrawer media={diagnosticMedia} onClose={() => setDiagnosticMedia(null)} />
        </Suspense>
      )}
    </DashboardLayout>
  );
}
