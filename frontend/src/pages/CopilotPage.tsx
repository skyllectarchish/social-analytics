import { useEffect, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import { Bot, Copy, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { useSync } from "../hooks/useSync";
import api, { safeGet } from "../api/client";
import type { CaptionSuggestResponse, ContentIdeasResponse, QuotaResponse } from "../api/types";
import { copilotIntro, copilotSuggestions } from "../data/labMock";

type Msg = { role: "user" | "ai"; text: string };

// Minimal markdown: **bold** + newlines.
function render(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <span key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
        ) : (
          <span key={j}>{part}</span>
        ),
      )}
      {i < lines.length - 1 && <br />}
    </span>
  ));
}

const CAPTION_INTENT = /hook|caption|draft|rewrite|\bwrite\b|title|copy/i;

function formatIdeas(d: ContentIdeasResponse): string | null {
  if (!d.ideas?.length) return null;
  const head = d.themes_detected?.length ? `Based on your themes (${d.themes_detected.slice(0, 3).join(", ")}), here's what I'd post:\n\n` : "Here's what I'd post next:\n\n";
  return (
    head +
    d.ideas
      .slice(0, 4)
      .map((idea, i) => `**${i + 1}. ${idea.title}** · ${idea.suggested_format}\n${idea.body_md}\n_Why: ${idea.rationale}_`)
      .join("\n\n")
  );
}

function formatCaption(d: CaptionSuggestResponse): string | null {
  if (!d.variants?.length) return null;
  const s = d.scores;
  return (
    `Scored your draft **${s.overall}/100** (hook ${s.hook_strength}, CTA ${s.cta_presence}, length ${s.length_fit}). Try these:\n\n` +
    d.variants
      .map((v) => `**${v.label}**\n${v.caption}\n_${v.rationale}_`)
      .join("\n\n")
  );
}

export default function CopilotPage() {
  const [days, setDays] = useState(30);
  const { syncing, sync } = useSync();
  const [messages, setMessages] = useState<Msg[]>([{ role: "ai", text: copilotIntro }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [quota, setQuota] = useState("412 / 500");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Live AI quota for the header.
  useEffect(() => {
    safeGet<QuotaResponse>("/ai/quota").then((q) => {
      if (q) setQuota(`${Math.max(0, q.limit - q.used)} / ${q.limit}`);
    });
  }, []);

  async function askAI(q: string): Promise<string> {
    try {
      if (CAPTION_INTENT.test(q)) {
        const { data } = await api.post<CaptionSuggestResponse>("/ai/caption/suggest", { draft: q, format: "REELS" });
        return formatCaption(data) ?? "Give me a rough caption to work from and I'll score it and draft variations.";
      }
      const { data } = await api.get<ContentIdeasResponse>("/ai/ideas", { params: { limit: 5 } });
      return formatIdeas(data) ?? "I don't have enough recent posts to suggest ideas yet — connect Instagram and Sync first.";
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) return "Connect your Instagram account first — then I can answer with your real numbers.";
      if (status === 429) return "You've used all your AI prompts for this billing period — they reset at the start of next month. Upgrade for a higher limit.";
      if (status === 401) return "Please sign in again to use Copilot.";
      if (status === 503) return "Copilot's AI service isn't configured yet — set it up to get live answers.";
      // network / 502 / anything else
      return "Copilot is temporarily unavailable — please try again in a moment.";
    }
  }

  async function ask(q: string) {
    const question = q.trim();
    if (!question || typing) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setTyping(true);
    const answer = await askAI(question);
    setMessages((m) => [...m, { role: "ai", text: answer }]);
    setTyping(false);
    // Refresh quota after a real call (best-effort).
    safeGet<QuotaResponse>("/ai/quota").then((qr) => {
      if (qr) setQuota(`${Math.max(0, qr.limit - qr.used)} / ${qr.limit}`);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <DashboardLayout active="AI Copilot" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing} fill>
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-ig grid h-10 w-10 place-items-center rounded-2xl text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AI Copilot</h1>
            <p className="text-xs text-foreground/55">Trained on your account · {quota} prompts left</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((m, i) =>
            m.role === "ai" ? (
              <div key={i} className="flex gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-lavender text-violet-deep">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="card-hairline max-w-[88%] rounded-2xl px-4 py-3">
                  <div className="text-sm leading-relaxed text-foreground/85">{render(m.text)}</div>
                  <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3 text-foreground/50">
                    <button className="rounded-lg p-1.5 hover:bg-black/5" aria-label="Helpful"><ThumbsUp className="h-3.5 w-3.5" /></button>
                    <button className="rounded-lg p-1.5 hover:bg-black/5" aria-label="Not helpful"><ThumbsDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => navigator.clipboard?.writeText(m.text)} className="rounded-lg p-1.5 hover:bg-black/5" aria-label="Copy"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md px-4 py-3 text-sm text-white" style={{ background: "var(--primary)" }}>
                  {m.text}
                </div>
              </div>
            ),
          )}

          {typing && (
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-lavender text-violet-deep">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="card-hairline flex items-center gap-1 rounded-2xl px-4 py-3.5">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet/60" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {copilotSuggestions.map((s) => (
            <button key={s} onClick={() => ask(s)} className="chip cursor-pointer hover:!bg-white">{s}</button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="glass-strong mt-4 flex items-center gap-2 rounded-2xl p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your Instagram…"
            aria-label="Message AI Copilot"
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40"
          />
          <button type="submit" className="btn-glow !px-4 !py-2 text-sm" aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
