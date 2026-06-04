import { useCallback, useEffect, useState } from "react";
import { AtSign, ExternalLink, Hash, Heart, Loader2, MessageCircle, Plus, X } from "lucide-react";
import api, { errorMessage, safeGet } from "../../api/client";
import type {
  BrandedHashtagItem,
  BrandedHashtagListResponse,
  BrandedHashtagMention,
  BrandedHashtagMentionsResponse,
} from "../../api/types";
import { CardEmpty } from "./States";
import { Skeleton } from "./Skeletons";

const MAX_TAGS = 3;

// Track up to 3 brand hashtags and browse their mentions (your own captions +
// comments on your posts — the Instagram Login API has no public tag search).
export default function BrandedHashtags({ days }: { days: number }) {
  const [tags, setTags] = useState<BrandedHashtagItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mentions, setMentions] = useState<BrandedHashtagMention[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await safeGet<BrandedHashtagListResponse>("/instagram/branded-hashtags", { days });
    setTags(res?.branded ?? []);
  }, [days]);

  useEffect(() => {
    setTags(null);
    setSelected(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) { setMentions(null); return; }
    let alive = true;
    setMentions(null);
    safeGet<BrandedHashtagMentionsResponse>(
      `/instagram/branded-hashtags/${encodeURIComponent(selected)}/mentions`,
      { days },
    ).then((res) => alive && setMentions(res?.mentions ?? []));
    return () => { alive = false; };
  }, [selected, days]);

  async function addTag() {
    const clean = input.trim().replace(/^#/, "").toLowerCase();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/instagram/branded-hashtags", { hashtag: clean });
      setInput("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not track that hashtag"));
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(tag: string) {
    try {
      await api.delete(`/instagram/branded-hashtags/${encodeURIComponent(tag)}`);
    } catch { /* idempotent */ }
    if (selected === tag) setSelected(null);
    await load();
  }

  return (
    <div className="card-hairline p-5">
      <h2 className="text-lg font-semibold">Branded hashtags</h2>
      <p className="text-xs text-foreground/55">
        Track up to {MAX_TAGS} brand tags — mentions from your captions and your posts' comments
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* tracked tags + add form */}
        <div>
          {tags === null ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <>
              <div className="space-y-2">
                {tags.map((t) => (
                  <div
                    key={t.hashtag}
                    className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition ${
                      selected === t.hashtag ? "bg-violet/5 ring-violet/30" : "ring-black/5 hover:bg-black/[0.02]"
                    }`}
                    onClick={() => setSelected(selected === t.hashtag ? null : t.hashtag)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(selected === t.hashtag ? null : t.hashtag)}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-lavender text-violet-deep">
                      <Hash className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">#{t.hashtag}</span>
                      <span className="num text-xs text-foreground/55">
                        {t.mention_count} mention{t.mention_count === 1 ? "" : "s"} · {t.unique_authors} author{t.unique_authors === 1 ? "" : "s"}
                      </span>
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTag(t.hashtag); }}
                      className="rounded-full p-1 text-foreground/0 transition hover:bg-rose-50 hover:!text-rose-500 group-hover:text-foreground/40"
                      aria-label={`Stop tracking #${t.hashtag}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {tags.length === 0 && (
                  <p className="rounded-xl bg-black/[0.03] px-3 py-4 text-center text-sm text-foreground/50">
                    No brand tags tracked yet.
                  </p>
                )}
              </div>

              {tags.length < MAX_TAGS && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-1.5 rounded-xl bg-white px-3 py-2 ring-1 ring-black/10 focus-within:ring-violet/50">
                      <Hash className="h-3.5 w-3.5 text-foreground/40" />
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addTag()}
                        placeholder="yourbrandtag"
                        className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
                        maxLength={100}
                      />
                    </div>
                    <button
                      onClick={addTag}
                      disabled={busy || !input.trim()}
                      className="btn-glow !px-3.5 !py-2 text-sm disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Track
                    </button>
                  </div>
                  {error && <p className="mt-1.5 text-xs text-rose-500">{error}</p>}
                </div>
              )}
            </>
          )}
        </div>

        {/* mentions for the selected tag */}
        <div className="min-h-[10rem] rounded-2xl bg-black/[0.02] p-4">
          {!selected ? (
            <CardEmpty label="Select a tracked tag to see its recent mentions." />
          ) : mentions === null ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : mentions.length === 0 ? (
            <CardEmpty label={`No mentions of #${selected} in this window yet.`} />
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {mentions.map((m) => (
                <div key={m.ig_comment_id} className="rounded-xl bg-white p-3 ring-1 ring-black/5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`chip !px-2 !py-0.5 !text-[10px] ${m.source === "post" ? "!bg-lavender !text-violet-deep" : ""}`}>
                      {m.source === "post" ? "Your post" : <><MessageCircle className="h-2.5 w-2.5" /> Comment</>}
                    </span>
                    {m.username && (
                      <span className="flex items-center gap-0.5 font-medium text-foreground/70">
                        <AtSign className="h-3 w-3" />{m.username}
                      </span>
                    )}
                    <span className="num ml-auto text-foreground/45">
                      {new Date(m.timestamp).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">{m.text}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-foreground/50">
                    <span className="num flex items-center gap-1"><Heart className="h-3 w-3" /> {m.like_count}</span>
                    {m.permalink && (
                      <a href={m.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-violet-deep hover:underline">
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
