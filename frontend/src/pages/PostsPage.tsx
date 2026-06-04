import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { FileUp, Heart, Loader2, MessageCircle } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { InstagramMedia, MediaListResponse } from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import PostInsightsDrawer, { type DrawerMedia } from "../components/dashboard/PostInsightsDrawer";
import { mediaLabel } from "../lib/labels";
import { useAuthedImage } from "../hooks/useAuthedImage";

const PAGE_SIZE = 24;

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

type TypeFilter = "all" | "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "IMAGE", label: "Images" },
  { key: "VIDEO", label: "Videos & Reels" },
  { key: "CAROUSEL_ALBUM", label: "Carousels" },
];

function PostThumb({ id }: { id: string }) {
  const src = useAuthedImage(id);
  if (!src) return <div className="bg-lavender h-full w-full" aria-hidden />;
  return (
    <img src={src} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
  );
}

function PostCard({ post, onOpen }: { post: InstagramMedia; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl bg-white text-left ring-1 ring-black/5 transition hover:ring-violet/40"
    >
      <div className="relative aspect-square overflow-hidden">
        <PostThumb id={post.ig_media_id} />
        <span className="chip absolute left-2 top-2 !border-white/10 !bg-black/50 !px-2 !py-0.5 !text-[10px] !text-white">
          {mediaLabel(post.media_type)}
        </span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-8 text-xs text-foreground/70">
          {post.caption || <span className="italic text-foreground/40">No caption</span>}
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-foreground/55">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> <span className="num">{fmt(post.like_count)}</span>
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> <span className="num">{fmt(post.comments_count)}</span>
          </span>
          <span className="ml-auto">
            {new Date(post.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function PostsPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [items, setItems] = useState<InstagramMedia[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [drawer, setDrawer] = useState<DrawerMedia>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (pageNum = 1) => {
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const { data } = await api.get<MediaListResponse>("/instagram/media", {
        // live: page 1 pulls the newest posts straight from Instagram before
        // serving, so new posts / fresh counts show without a manual Sync.
        params: { page: pageNum, page_size: PAGE_SIZE, live: pageNum === 1 },
      });
      setTotal(data.total);
      setItems((prev) => (pageNum === 1 ? data.items : [...prev, ...data.items]));
      setPage(pageNum);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        navigate("/connect", { replace: true });
        return;
      }
      setError(errorMessage(err, "Could not load your posts"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [navigate]);

  useEffect(() => {
    load(1);
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      await api.post("/instagram/refresh");
      await load(1);
    } catch (err) {
      setError(errorMessage(err, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  const visible = filter === "all" ? items : items.filter((p) => p.media_type === filter);

  if (loading && items.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ backgroundColor: "#F5F6FA" }}>
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  return (
    <DashboardLayout active="Posts" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              All posts{" "}
              <span className="font-serif font-normal italic text-foreground/60">
                — your full archive.
              </span>
            </h1>
            <p className="mt-1 text-sm text-foreground/55">
              <span className="num">{total}</span> posts stored · click any post for its insights
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`chip cursor-pointer transition ${filter === f.key ? "!bg-ink !text-white" : ""}`}
              >
                {f.label}
              </button>
            ))}
            <Link to="/dashboard/import" className="chip !border-violet/25 !text-violet-deep" title="Import your Instagram data export">
              <FileUp className="h-3.5 w-3.5" /> Import archive
            </Link>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="card-hairline p-5">
            <CardEmpty label="No posts here yet — hit Sync to pull your posts from Instagram." />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <PostCard
                key={p.ig_media_id}
                post={p}
                onOpen={() => setDrawer({ igId: p.ig_media_id, title: p.caption, permalink: p.permalink })}
              />
            ))}
          </div>
        )}

        {items.length < total && (
          <div className="flex justify-center">
            <button
              onClick={() => load(page + 1)}
              disabled={loadingMore}
              className="chip cursor-pointer disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Load more ({items.length} of <span className="num">{total}</span>)
            </button>
          </div>
        )}
      </div>

      <PostInsightsDrawer media={drawer} onClose={() => setDrawer(null)} />
    </DashboardLayout>
  );
}
