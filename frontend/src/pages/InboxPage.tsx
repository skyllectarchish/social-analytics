import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowUpRight,
  Briefcase,
  Check,
  CornerDownRight,
  Heart,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import api, { errorMessage, safeGet } from "../api/client";
import type {
  CommentInboxResponse,
  CommentReplySuggestion,
  CommentReplySuggestResponse,
  InboxComment,
  SuperfanItem,
  SuperfansResponse,
} from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { useAuthedImage } from "../hooks/useAuthedImage";

const PAGE_SIZE = 20;

type Filter = "all" | "unanswered" | "questions" | "collabs" | "positive" | "negative";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unanswered", label: "Unanswered" },
  { key: "questions", label: "Questions" },
  { key: "collabs", label: "Collabs" },
  { key: "positive", label: "Positive" },
  { key: "negative", label: "Negative" },
];

function filterParams(filter: Filter): Record<string, unknown> {
  switch (filter) {
    case "unanswered": return { unanswered_only: true };
    case "questions": return { questions_only: true };
    case "collabs": return { collab_only: true };
    case "positive": return { sentiment: "positive" };
    case "negative": return { sentiment: "negative" };
    default: return {};
  }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 30))}mo`;
}

const SENTIMENT_CHIP: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-600",
  negative: "bg-rose-50 text-rose-600",
  neutral: "bg-black/5 text-foreground/55",
};

const TONE_LABEL: Record<CommentReplySuggestion["tone"], string> = {
  friendly: "Friendly",
  playful: "Playful",
  professional: "Professional",
};

function PostThumb({ id, permalink }: { id: string; permalink: string }) {
  const src = useAuthedImage(id);
  const img = src ? (
    <img src={src} alt="" className="h-full w-full object-cover" />
  ) : (
    <div className="bg-lavender h-full w-full" aria-hidden />
  );
  return permalink ? (
    <a
      href={permalink}
      target="_blank"
      rel="noreferrer"
      className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5 transition hover:ring-violet/40"
      title="Open post on Instagram"
    >
      {img}
    </a>
  ) : (
    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5">{img}</span>
  );
}

function ReplyComposer({
  comment,
  onReplied,
}: {
  comment: InboxComment;
  onReplied: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CommentReplySuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const { data } = await api.post<CommentReplySuggestResponse>("/ai/comment-reply", {
        ig_comment_id: comment.ig_comment_id,
      });
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(errorMessage(err, "Could not generate suggestions"));
    } finally {
      setSuggesting(false);
    }
  }

  async function send() {
    const body = message.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/instagram/comments/${comment.ig_comment_id}/reply`, { message: body });
      onReplied();
    } catch (err) {
      setError(errorMessage(err, "Could not post the reply"));
      setSending(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
      {suggestions.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => setMessage(s.reply)}
              className="rounded-xl bg-lavender/50 p-2.5 text-left text-xs transition hover:bg-lavender"
            >
              <span className="font-semibold text-violet-deep">{TONE_LABEL[s.tone]}</span>
              <span className="mt-1 block text-foreground/70">{s.reply}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={2200}
            placeholder={`Reply to @${comment.username}…`}
            className="w-full resize-none rounded-xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/40"
          />
        </div>
        <button
          onClick={suggest}
          disabled={suggesting}
          className="chip cursor-pointer disabled:opacity-60"
          title="Suggest replies with AI (uses 1 AI call)"
        >
          {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI
        </button>
        <button
          onClick={send}
          disabled={sending || !message.trim()}
          className="btn-glow !px-4 !py-2 text-sm disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Reply
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

function SuperfansCard({ fans }: { fans: SuperfanItem[] }) {
  if (fans.length === 0) return null;
  return (
    <div className="card-hairline p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-violet-deep">
        <Star className="h-3.5 w-3.5" /> Superfans
        <span className="font-normal text-foreground/45">
          — repeat engagers in the last 90 days. Reply to them first.
        </span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {fans.slice(0, 8).map((f) => (
          <li
            key={f.username}
            className="flex items-center gap-1.5 rounded-full bg-lavender/60 px-3 py-1 text-xs"
            title={`${f.comment_count} comments across ${f.posts_touched} posts`}
          >
            <span className="font-semibold">@{f.username}</span>
            <span className="num text-foreground/55">{f.comment_count}×</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InboxPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<Filter>("all");
  const [comments, setComments] = useState<InboxComment[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [superfans, setSuperfans] = useState<SuperfanItem[]>([]);

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const { data } = await api.get<CommentInboxResponse>("/instagram/comments/inbox", {
        params: { ...filterParams(filter), limit: PAGE_SIZE, offset },
      });
      setTotal(data.total);
      setComments((prev) => (offset === 0 ? data.comments : [...prev, ...data.comments]));
    } catch (err) {
      // Only a 404 from /profile means "not connected" (app convention) — a
      // 404 from the inbox route itself can also mean the backend predates
      // the feature, so verify before bouncing the user to /connect.
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        const profile = await api.get("/instagram/profile").then(() => true).catch(() => false);
        if (!profile) {
          navigate("/connect", { replace: true });
          return;
        }
      }
      setError(errorMessage(err, "Could not load your inbox"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, navigate]);

  useEffect(() => {
    load(0);
  }, [load]);

  useEffect(() => {
    safeGet<SuperfansResponse>("/instagram/comments/superfans").then((r) => {
      if (r) setSuperfans(r.superfans);
    });
  }, []);

  async function sync() {
    setSyncing(true);
    try {
      // Comments piggyback on the insights sync (same cadence as media insights).
      await api.post("/instagram/insights/sync", null, { params: { lookback_days: days } });
      await load(0);
    } catch (err) {
      setError(errorMessage(err, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  function markReplied(id: string) {
    setComments((prev) => prev.map((c) => (c.ig_comment_id === id ? { ...c, replied: true } : c)));
    setExpanded(null);
  }

  if (loading && comments.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ backgroundColor: "#F5F6FA" }}>
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  return (
    <DashboardLayout active="Inbox" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="mx-auto max-w-3xl space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Inbox{" "}
            <span className="font-serif font-normal italic text-foreground/60">
              — every comment, one place.
            </span>
          </h1>
          <p className="mt-1 text-sm text-foreground/55">
            <span className="num">{total}</span> comments · reply directly or let AI draft one in your voice
          </p>
        </div>

        <SuperfansCard fans={superfans} />

        {/* filters */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`chip cursor-pointer transition ${
                filter === f.key ? "!bg-ink !text-white" : ""
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* comment list */}
        {comments.length === 0 ? (
          <div className="card-hairline p-5">
            <CardEmpty
              label={
                filter === "all"
                  ? "No comments synced yet. Note: Meta only returns real comments once the app has Advanced Access on manage_comments (Meta App Review) — until it's approved, this inbox stays empty even when your posts have comments."
                  : "No comments match this filter."
              }
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => {
              const isOpen = expanded === c.ig_comment_id;
              return (
                <li key={c.ig_comment_id} className="card-hairline p-4">
                  <div className="flex gap-3">
                    <PostThumb id={c.ig_media_id} permalink={c.permalink} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-semibold">@{c.username}</span>
                        <span className="text-foreground/45">{timeAgo(c.timestamp)} ago</span>
                        {c.like_count > 0 && (
                          <span className="flex items-center gap-0.5 text-foreground/45">
                            <Heart className="h-3 w-3" /> <span className="num">{c.like_count}</span>
                          </span>
                        )}
                        {c.sentiment && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SENTIMENT_CHIP[c.sentiment]}`}>
                            {c.sentiment}
                          </span>
                        )}
                        {c.is_question && (
                          <span className="flex items-center gap-0.5 rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet-deep">
                            <HelpCircle className="h-3 w-3" /> question
                          </span>
                        )}
                        {c.is_collab && (
                          <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                            <Briefcase className="h-3 w-3" /> collab
                          </span>
                        )}
                        {c.is_superfan && (
                          <span className="flex items-center gap-0.5 rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium text-violet-deep" title="Repeat engager — commented on several of your posts recently">
                            <Star className="h-3 w-3" /> superfan
                          </span>
                        )}
                        {c.replied && (
                          <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                            <Check className="h-3 w-3" /> replied
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm">{c.text}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => setExpanded(isOpen ? null : c.ig_comment_id)}
                          className="flex items-center gap-1 text-xs font-medium text-violet-deep transition hover:text-violet"
                        >
                          <CornerDownRight className="h-3.5 w-3.5" />
                          {isOpen ? "Close" : c.replied ? "Reply again" : "Reply"}
                        </button>
                        {c.permalink && (
                          <a
                            href={c.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-foreground/45 transition hover:text-violet"
                          >
                            View post <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {isOpen && (
                        <ReplyComposer comment={c} onReplied={() => markReplied(c.ig_comment_id)} />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {comments.length < total && (
          <div className="flex justify-center">
            <button
              onClick={() => load(comments.length)}
              disabled={loadingMore}
              className="chip cursor-pointer disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Load more ({comments.length} of <span className="num">{total}</span>)
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
