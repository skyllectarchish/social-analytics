import { useState } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/shared/PageHeader";
import QualityHeroMetrics from "../components/audience-dna/QualityHeroMetrics";
import QualityRadar from "../components/audience-dna/QualityRadar";
import CohortQualityTable from "../components/audience-dna/CohortQualityTable";
import SpikeTimeline from "../components/audience-dna/SpikeTimeline";
import SyncButton from "../components/dashboard/SyncButton";

const BREAKDOWN_OPTIONS = [
  { value: "age", label: "Age" },
  { value: "gender", label: "Gender" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
];

export default function AudienceDNAPage() {
  const [breakdown, setBreakdown] = useState("age");
  const [spikeDays, setSpikeDays] = useState(90);

  return (
    <DashboardLayout>
      <PageHeader
        title="Audience DNA"
        emoji="👥"
        subtitle="Understand which follower segments are truly engaged vs dormant."
        actions={<SyncButton />}
      />

      <div className="space-y-4">
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

        <QualityHeroMetrics breakdown={breakdown} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <QualityRadar breakdown={breakdown} />
          </div>
          <div className="lg:col-span-7">
            <CohortQualityTable breakdown={breakdown} />
          </div>
        </div>

        <SpikeTimeline days={spikeDays} onDaysChange={setSpikeDays} />
      </div>
    </DashboardLayout>
  );
}
