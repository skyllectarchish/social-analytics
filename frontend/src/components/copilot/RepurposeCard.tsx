import { useState } from "react";
import { Check, Copy, Loader2, Recycle, Sparkles } from "lucide-react";
import api, { errorMessage } from "../../api/client";
import type { RepurposeResponse } from "../../api/types";
import AIMarkdown from "./AIMarkdown";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

const TABS: { key: keyof RepurposeResponse; label: string }[] = [
  { key: "reel_script_md", label: "Reel script" },
  { key: "carousel_md", label: "Carousel" },
  { key: "story_sequence_md", label: "Stories" },
  { key: "tweet_thread_md", label: "Tweet thread" },
];

// Paste one piece of content → four format assets, in the creator's voice.
export default function RepurposeCard({
  exhausted,
  onQuotaSpent,
}: {
  exhausted: boolean;
  onQuotaSpent: () => void;
}) {
  const [content, setContent] = useState("");
  const [res, setRes] = useState<RepurposeResponse | null>(null);
  const [tab, setTab] = useState<keyof RepurposeResponse>("reel_script_md");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (content.trim().length < 20) {
      setError("Paste at least a few sentences to repurpose.");
      return;
    }
    setLoading(true);
    setError(null);
    trackAI("repurpose", "requested");
    try {
      const { data } = await api.post<RepurposeResponse>("/ai/repurpose", { content: content.trim() });
      setRes(data);
      setTab("reel_script_md");
      onQuotaSpent();
    } catch (err) {
      setError(errorMessage(err, "Repurposing failed"));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!res) return;
    try {
      await navigator.clipboard.writeText(res[tab]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="card-hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Recycle className="h-4 w-4 text-emerald-600" /> Content repurposer
          </h2>
          <p className="text-xs text-foreground/55">
            One idea, four assets — reel script, carousel, story sequence, tweet thread
          </p>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={6000}
        placeholder="Paste a caption, script, blog excerpt, or rough notes…"
        className="mt-3 w-full resize-y rounded-2xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/40"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="num text-[11px] text-foreground/45">{content.length} / 6000</span>
        <button
          onClick={run}
          disabled={loading || exhausted || content.trim().length < 20}
          title={exhausted ? "AI quota exhausted" : "Repurpose · 1 AI call"}
          className="btn-glow !px-4 !py-2 text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Repurpose
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

      {res && (
        <div className="mt-4 border-t border-black/5 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`chip cursor-pointer transition ${tab === t.key ? "!bg-ink !text-white" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <AIMarkdown text={res[tab]} className="!text-sm" />
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <button onClick={copy} className="chip cursor-pointer">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy {TABS.find((t) => t.key === tab)?.label.toLowerCase()}</>}
            </button>
            <AIFeedback feature="repurpose" refId={tab} />
          </div>
        </div>
      )}
    </div>
  );
}
