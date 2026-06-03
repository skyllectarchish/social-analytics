import { lazy, Suspense, useState } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import QualityHeroMetrics from "../components/audience-dna/QualityHeroMetrics";
import QualityRadar from "../components/audience-dna/QualityRadar";
import CohortQualityTable from "../components/audience-dna/CohortQualityTable";
import SpikeTimeline from "../components/audience-dna/SpikeTimeline";
import GrowthDriversTable from "../components/audience-dna/GrowthDriversTable";
import GrowthCorrelationChart from "../components/audience-dna/GrowthCorrelationChart";
import VoiceEmptyBanner from "../components/audience-dna/VoiceEmptyBanner";
import SentimentDonut from "../components/audience-dna/SentimentDonut";
import TopicChips from "../components/audience-dna/TopicChips";
import SentimentTrendChart from "../components/audience-dna/SentimentTrendChart";
import QuestionPostsCard from "../components/audience-dna/QuestionPostsCard";
import PostInsightsDrawer from "../components/dashboard/PostInsightsDrawer";
import SyncButton from "../components/dashboard/SyncButton";

const PostDiagnosticDrawer = lazy(() =>
  import("../components/copilot/PostDiagnosticDrawer"),
);

const BREAKDOWN_OPTIONS = [
  { value: "age", label: "Age" },
  { value: "gender", label: "Gender" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
];

function adaptQuestionPost(p) {
  if (!p) return null;
  return {
    ig_media_id: p.ig_media_id,
    media_type: p.media_type ?? "IMAGE",
    media_url: p.thumbnail_url,
    thumbnail_url: p.thumbnail_url,
    permalink: p.permalink,
    caption: p.caption,
    timestamp: p.timestamp,
  };
}

function adaptDriver(p) {
  if (!p) return null;
  const isReel = p.media_product_type === "REELS";
  return {
    ig_media_id: p.ig_media_id,
    media_type: isReel ? "VIDEO" : "IMAGE",
    media_url: p.thumbnail_url,
    thumbnail_url: p.thumbnail_url,
    permalink: p.permalink,
    caption: p.caption,
    timestamp: p.timestamp,
  };
}

export default function AudienceDNAPage() {
  const [breakdown, setBreakdown] = useState("age");
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [diagnosticMedia, setDiagnosticMedia] = useState(null);

  return (
    <DashboardLayout>
      <PageHeader
        title="Audience DNA"
        subtitle="Which follower segments are truly engaged vs dormant."
        actions={<SyncButton />}
      />

      <div className="space-y-3">
        {/* Breakdown selector */}
        <div className="flex gap-1.5 flex-wrap">
          {BREAKDOWN_OPTIONS.map((opt) => {
            const active = breakdown === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setBreakdown(opt.value)}
                className="relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={{ color: active ? "#6d28d9" : "#64748b" }}
              >
                {active && (
                  <motion.span
                    layoutId="audience-breakdown-active"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.25)" }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                  />
                )}
                <span className="relative">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <QualityHeroMetrics breakdown={breakdown} />

        {/* 2-column: quality/growth left, tables/voice right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {/* Left: radar + growth drivers + spike */}
          <div className="space-y-3">
            <QualityRadar breakdown={breakdown} />
            <GrowthDriversTable
              onSelectPost={(p) => setSelectedMedia(adaptDriver(p))}
            />
            <SpikeTimeline
              onSelectPost={(p) => setSelectedMedia(adaptDriver(p))}
            />
          </div>

          {/* Right: cohort table + correlation + audience voice */}
          <div className="space-y-3">
            <CohortQualityTable breakdown={breakdown} />
            <GrowthCorrelationChart />

            {/* Audience Voice */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>💬</span> Audience Voice
              </p>
              <VoiceEmptyBanner />
              <div className="grid grid-cols-[5fr_7fr] gap-3">
                <SentimentDonut />
                <TopicChips />
              </div>
              <div className="grid grid-cols-[7fr_5fr] gap-3">
                <SentimentTrendChart />
                <QuestionPostsCard
                  onSelect={(p) => setSelectedMedia(adaptQuestionPost(p))}
                />
              </div>
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
