import { lazy, Suspense, useState } from "react";
import { motion } from "framer-motion";
import { Gauge, TrendingUp, MessageCircle } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import { SectionDivider } from "../components/shared/SectionCard";
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
      <div className="lab-grid">
        <PageHeader
          title="Audience DNA"
          emoji="👥"
          subtitle="Understand which follower segments are truly engaged vs dormant."
          actions={<SyncButton />}
        />

        <div className="space-y-9">
          <div className="flex gap-2 flex-wrap">
            {BREAKDOWN_OPTIONS.map((opt) => {
              const active = breakdown === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setBreakdown(opt.value)}
                  className="relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={{
                    color: active ? "#6d28d9" : "#64748b",
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="audience-breakdown-active"
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: "rgba(139,92,246,0.10)",
                        border: "1px solid rgba(139,92,246,0.25)",
                      }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                    />
                  )}
                  <span className="relative">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <section className="space-y-4">
            <SectionDivider icon={Gauge} title="Audience Quality" />
            <QualityHeroMetrics breakdown={breakdown} />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5">
                <QualityRadar breakdown={breakdown} />
              </div>
              <div className="lg:col-span-7">
                <CohortQualityTable breakdown={breakdown} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionDivider icon={TrendingUp} title="Growth Drivers" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <GrowthDriversTable
                  onSelectPost={(p) => setSelectedMedia(adaptDriver(p))}
                />
              </div>
              <div className="lg:col-span-5">
                <GrowthCorrelationChart />
              </div>
            </div>
            <SpikeTimeline
              onSelectPost={(p) => setSelectedMedia(adaptDriver(p))}
            />
          </section>

          <section className="space-y-4">
            <SectionDivider icon={MessageCircle} title="Audience Voice" />
            <VoiceEmptyBanner />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5">
                <SentimentDonut />
              </div>
              <div className="lg:col-span-7">
                <TopicChips />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <SentimentTrendChart />
              </div>
              <div className="lg:col-span-5">
                <QuestionPostsCard
                  onSelect={(p) => setSelectedMedia(adaptQuestionPost(p))}
                />
              </div>
            </div>
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
