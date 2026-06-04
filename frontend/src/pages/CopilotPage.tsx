import { useCallback, useEffect, useState } from "react";
import { Bot, PenLine, Zap } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import WeeklyDigestCard from "../components/copilot/WeeklyDigestCard";
import ContentIdeasPanel from "../components/copilot/ContentIdeasPanel";
import CaptionStudioDialog from "../components/copilot/CaptionStudioDialog";
import PostDiagnosticDrawer from "../components/copilot/PostDiagnosticDrawer";
import AIDisclosure, { aiDisclosureAcked } from "../components/copilot/AIDisclosure";
import { AnimatedCard } from "../components/ui/Motion";
import { useSync } from "../hooks/useSync";
import { safeGet } from "../api/client";
import type { QuotaResponse } from "../api/types";
import { trackAI } from "../lib/telemetry";

export default function CopilotPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [diagnoseId, setDiagnoseId] = useState<string | null>(null);
  const [acked, setAcked] = useState(aiDisclosureAcked());

  const refreshQuota = useCallback(() => {
    safeGet<QuotaResponse>("/ai/quota").then((q) => q && setQuota(q));
  }, []);

  useEffect(() => {
    refreshQuota();
    if (aiDisclosureAcked()) trackAI("copilot_nav", "viewed");
  }, [refreshQuota]);

  const exhausted = !!quota && quota.limit > 0 && quota.used >= quota.limit;
  const remaining = quota ? Math.max(0, quota.limit - quota.used) : null;
  const resetsAt = quota ? new Date(quota.resets_at).toLocaleDateString(undefined, { month: "short", day: "2-digit" }) : null;

  return (
    <DashboardLayout active="AI Copilot" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      {!acked && <AIDisclosure onAck={() => { setAcked(true); trackAI("copilot_nav", "viewed", { meta: { source: "post_disclosure" } }); }} />}

      <div className="space-y-6">
        <AnimatedCard className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight md:text-4xl">
              <span className="bg-ig grid h-9 w-9 place-items-center rounded-2xl text-white"><Bot className="h-5 w-5" /></span>
              AI Copilot
            </h1>
            <p className="mt-1 text-sm text-foreground/55">
              Weekly digest, content ideas, caption scoring and post diagnostics — grounded in your real numbers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`chip ${exhausted ? "!bg-rose-50 !text-rose-600 !ring-1 !ring-rose-200" : ""}`}
              title={quota ? `${remaining} of ${quota.limit} AI calls left this month · resets ${resetsAt}` : undefined}
            >
              <Zap className="h-3.5 w-3.5" /> {quota ? (exhausted ? `Quota resets ${resetsAt}` : `${remaining} / ${quota.limit} calls`) : "—"}
            </span>
            <button onClick={() => setCaptionOpen(true)} className="btn-glow !px-4 !py-2 text-sm">
              <PenLine className="h-4 w-4" /> Caption studio
            </button>
          </div>
        </AnimatedCard>

        <AnimatedCard delay={0.05}>
          <WeeklyDigestCard exhausted={exhausted} onQuotaSpent={refreshQuota} />
        </AnimatedCard>

        <AnimatedCard delay={0.1}>
          <ContentIdeasPanel exhausted={exhausted} onQuotaSpent={refreshQuota} onDiagnose={setDiagnoseId} />
        </AnimatedCard>
      </div>

      <CaptionStudioDialog open={captionOpen} onClose={() => setCaptionOpen(false)} exhausted={exhausted} onQuotaSpent={refreshQuota} />
      <PostDiagnosticDrawer igMediaId={diagnoseId} onClose={() => setDiagnoseId(null)} onQuotaSpent={refreshQuota} />
    </DashboardLayout>
  );
}
