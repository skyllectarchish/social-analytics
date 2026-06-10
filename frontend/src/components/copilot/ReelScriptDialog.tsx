import { useEffect, useState } from "react";
import { Check, Clapperboard, Copy, X } from "lucide-react";
import api, { errorMessage } from "../../api/client";
import type { Idea, ReelScriptResponse } from "../../api/types";
import { TextBlockSkeleton } from "../dashboard/Skeletons";
import AIFeedback from "./AIFeedback";
import { trackAI } from "../../lib/telemetry";

// Idea → ready-to-shoot reel script. Opened from an IdeaCard's "Script"
// button; the LLM call (1 quota slot) fires on open.
export default function ReelScriptDialog({
  idea,
  onClose,
  onQuotaSpent,
}: {
  idea: Idea | null;
  onClose: () => void;
  onQuotaSpent: () => void;
}) {
  const [script, setScript] = useState<ReelScriptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!idea) return;
    let alive = true;
    setScript(null);
    setError(null);
    setLoading(true);
    trackAI("reel_script", "requested", { refId: idea.id });
    api
      .post<ReelScriptResponse>("/ai/reel-script", { title: idea.title, summary: idea.body_md })
      .then(({ data }) => {
        if (!alive) return;
        setScript(data);
        onQuotaSpent();
      })
      .catch((err) => alive && setError(errorMessage(err, "Could not write the script")))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea?.id]);

  async function copyAll() {
    if (!script) return;
    const text = [
      `HOOK: ${script.hook}`,
      "",
      ...script.beats.map((b) =>
        `[${b.seconds}s] ${b.action}` +
        (b.voiceover ? `\n    VO: ${b.voiceover}` : "") +
        (b.on_screen_text ? `\n    TEXT: ${b.on_screen_text}` : ""),
      ),
      "",
      `CTA: ${script.cta}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  if (!idea) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,14,39,0.35)] backdrop-blur-sm" onClick={onClose} />
      <div className="glass-strong relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl p-6">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-foreground/60 hover:bg-black/5">
          <X className="h-5 w-5" />
        </button>
        <h2 className="flex items-center gap-2 pr-8 text-lg font-semibold">
          <Clapperboard className="h-4 w-4 text-violet" /> Reel script
        </h2>
        <p className="mt-0.5 text-xs text-foreground/55">{idea.title}</p>

        {loading && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-foreground/55">Writing in your voice…</p>
            <TextBlockSkeleton lines={6} />
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        {script && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-lavender/60 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-deep">Hook</div>
              <p className="mt-0.5 text-sm font-semibold">{script.hook}</p>
            </div>

            <ol className="space-y-2">
              {script.beats.map((b, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5">
                  <span className="num mt-0.5 shrink-0 rounded-lg bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {b.seconds}s
                  </span>
                  <span className="min-w-0 text-xs">
                    <span className="block font-medium">{b.action}</span>
                    {b.voiceover && <span className="mt-0.5 block text-foreground/60">🎙 {b.voiceover}</span>}
                    {b.on_screen_text && <span className="mt-0.5 block font-semibold text-violet-deep">⌨ {b.on_screen_text}</span>}
                  </span>
                </li>
              ))}
            </ol>

            <div className="rounded-2xl bg-mint/40 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">CTA</div>
              <p className="mt-0.5 text-sm font-semibold">{script.cta}</p>
            </div>

            <p className="text-[11px] italic text-foreground/50">
              ~{script.duration_s}s · {script.rationale}
            </p>

            <div className="flex items-center justify-between border-t border-black/5 pt-3">
              <button onClick={copyAll} className="chip cursor-pointer">
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy script</>}
              </button>
              <AIFeedback feature="reel_script" refId={idea.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
