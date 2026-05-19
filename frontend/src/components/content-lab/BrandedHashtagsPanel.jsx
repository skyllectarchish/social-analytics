import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  AtSign,
  Heart,
  ExternalLink,
  FileText,
  MessageCircle,
} from "lucide-react";
import AnimatedCard from "../shared/AnimatedCard";
import { SkeletonChart } from "../shared/Skeleton";
import {
  useBrandedHashtags,
  useBrandedHashtagMentions,
} from "../../hooks/useBrandedHashtags";

const MAX_BRANDED = 3;

function fmtNum(v) {
  if (v == null) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function AddRow({ onAdd, disabled }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const clean = value.trim().replace(/^#/, "");
    if (!clean) return;
    setSubmitting(true);
    setError("");
    try {
      await onAdd(clean);
      setValue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 mb-3">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          #
        </span>
        <input
          type="text"
          placeholder="e.g. mybrand"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || submitting}
          maxLength={60}
          className="w-full text-xs pl-7 pr-3 py-2 rounded-lg border border-slate-200 focus:border-violet-400 focus:outline-none disabled:bg-slate-50 disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || submitting || !value.trim()}
        className="text-xs px-3 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1"
      >
        <Plus size={12} /> Track
      </button>
      {error && (
        <p className="absolute mt-12 text-[10px] text-rose-500">{error}</p>
      )}
    </form>
  );
}

function MentionList({ hashtag }) {
  const { data, loading } = useBrandedHashtagMentions(hashtag);
  if (!hashtag) return null;
  if (loading) return <SkeletonChart height="h-[220px]" />;

  const mentions = data?.mentions ?? [];
  if (mentions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-slate-400">
          No mentions yet for #{hashtag}.
        </p>
        <p className="text-[10px] text-slate-400 mt-1">
          We scan your captions and comments on your posts. Run a refresh to
          sync the latest comments, then check back.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
      {mentions.map((m) => {
        const isPost = m.source === "post";
        const Icon = isPost ? FileText : MessageCircle;
        const sourceLabel = isPost ? "Your post" : "Comment";
        const author = isPost ? "Your post" : `@${m.username || "unknown"}`;
        return (
          <div
            key={m.ig_comment_id}
            className="p-2 rounded-lg hover:bg-slate-50 group"
          >
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
              <span
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold uppercase tracking-wider ${
                  isPost
                    ? "text-violet-700 bg-violet-50 border-violet-200"
                    : "text-sky-700 bg-sky-50 border-sky-200"
                }`}
              >
                <Icon size={9} /> {sourceLabel}
              </span>
              <span className="font-semibold text-slate-700">{author}</span>
              <span>·</span>
              <span>{m.timestamp?.slice(0, 10)}</span>
              {m.permalink && (
                <a
                  href={m.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto opacity-0 group-hover:opacity-100 text-violet-500 flex items-center gap-0.5"
                  title="Open the post on Instagram"
                >
                  <ExternalLink size={9} /> post
                </a>
              )}
            </div>
            <p className="text-xs text-slate-700 line-clamp-3 italic">
              "{m.text || ""}"
            </p>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-0.5">
                <Heart size={9} /> {fmtNum(m.like_count)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BrandedHashtagsPanel() {
  const { data, loading, error, add, remove } = useBrandedHashtags();
  const [selected, setSelected] = useState(null);

  const branded = data?.branded ?? [];
  const canAdd = branded.length < MAX_BRANDED;

  if (loading) return <SkeletonChart height="h-[420px]" />;

  return (
    <AnimatedCard className="p-5" delay={0.06}>
      <div className="flex items-start gap-2 mb-4">
        <AtSign size={14} className="text-violet-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Branded hashtag tracking
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Tracks up to {MAX_BRANDED} brand tags across your own captions
            and the comments you receive on those posts. Pure local scan —
            no external API.
          </p>
        </div>
      </div>

      <AddRow onAdd={add} disabled={!canAdd} />
      {error && (
        <p className="text-xs text-rose-500 mb-2">{error}</p>
      )}

      {branded.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">
          Add a branded hashtag to start tracking public mentions.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-1">
            <AnimatePresence initial={false}>
              {branded.map((t) => {
                const isSelected = selected === t.hashtag;
                return (
                  <motion.div
                    key={t.hashtag}
                    layout
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                    onClick={() => setSelected(isSelected ? null : t.hashtag)}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer group ${
                      isSelected ? "bg-violet-50" : "hover:bg-slate-50"
                    }`}
                    style={
                      isSelected
                        ? { boxShadow: "inset 2px 0 0 #8b5cf6" }
                        : undefined
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-violet-700 font-medium truncate">
                        #{t.hashtag}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {t.mention_count} mention{t.mention_count === 1 ? "" : "s"}
                        {" · "}
                        {t.unique_authors} author{t.unique_authors === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(t.hashtag);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50"
                      aria-label={`Remove ${t.hashtag}`}
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <div className="lg:col-span-7">
            {selected ? (
              <MentionList hashtag={selected} />
            ) : (
              <p className="text-xs text-slate-400 text-center py-12">
                Select a tag to see recent mentions.
              </p>
            )}
          </div>
        </div>
      )}
    </AnimatedCard>
  );
}
