import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { safeGet } from "../../api/client";
import type { MediaInsightsResponse } from "../../api/types";
import { useAuthedImage } from "../../hooks/useAuthedImage";
import { Skeleton } from "./Skeletons";

export type DrawerMedia = {
  igId: string;
  title?: string;
  permalink?: string;
} | null;

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n).toLocaleString()}`;

// "total_interactions" → "Total interactions"
const metricLabel = (name: string) => {
  const s = name.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Slide-over showing per-post insight metrics from /instagram/insights/media/{id}.
export default function PostInsightsDrawer({
  media,
  onClose,
}: {
  media: DrawerMedia;
  onClose: () => void;
}) {
  const [insights, setInsights] = useState<{ label: string; value: string }[] | null>(null);
  const src = useAuthedImage(media?.igId);

  useEffect(() => {
    if (!media) return;
    setInsights(null);
    let alive = true;
    safeGet<MediaInsightsResponse>(`/instagram/insights/media/${media.igId}`).then((res) => {
      if (!alive) return;
      setInsights(
        (res?.insights ?? [])
          .filter((i) => i.value !== 0)
          .map((i) => ({ label: metricLabel(i.metric_name), value: fmt(i.value) })),
      );
    });
    return () => {
      alive = false;
    };
  }, [media]);

  // Close on Escape while open.
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media, onClose]);

  return (
    <AnimatePresence>
      {media && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(10,14,39,0.3)] backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-2xl"
            role="dialog"
            aria-label="Post insights"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Post insights</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-foreground/60 transition hover:bg-black/5"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-black/5">
              {src ? (
                <img src={src} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="bg-lavender aspect-square w-full" />
              )}
            </div>

            {media.title && <p className="mt-3 line-clamp-3 text-sm text-foreground/70">{media.title}</p>}

            {media.permalink && (
              <a
                href={media.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-violet-deep hover:underline"
              >
                View on Instagram <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/55">Metrics</h3>
              {insights === null ? (
                <div className="mt-3 space-y-2.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : insights.length === 0 ? (
                <p className="mt-3 text-sm text-foreground/50">No insight metrics for this post yet.</p>
              ) : (
                <div className="mt-2 divide-y divide-black/5">
                  {insights.map((m) => (
                    <div key={m.label} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-foreground/70">{m.label}</span>
                      <span className="num font-semibold">{m.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
