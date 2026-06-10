import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import api, { errorMessage, safeGet } from "../api/client";
import type {
  DMFunnel,
  DMFunnelListResponse,
  DMFunnelSend,
  DMFunnelSendsResponse,
  MediaListResponse,
} from "../api/types";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import { CardEmpty } from "../components/dashboard/States";
import { ListSkeleton } from "../components/dashboard/Skeletons";

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function captionPreview(caption: string): string {
  const flat = caption.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat || "(no caption)";
}

function CreateAutomationForm({
  posts,
  onCreated,
  onClose,
}: {
  posts: { ig_media_id: string; caption: string }[];
  onCreated: (f: DMFunnel) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [publicReply, setPublicReply] = useState("");
  const [scope, setScope] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<DMFunnel>("/instagram/dm-funnels", {
        keyword: keyword.trim(),
        dm_message: dmMessage.trim(),
        public_reply: publicReply.trim(),
        ig_media_id: scope,
      });
      onCreated(data);
    } catch (err) {
      setError(errorMessage(err, "Could not create the automation"));
    } finally {
      setSaving(false);
    }
  }

  const valid = keyword.trim().length >= 2 && dmMessage.trim().length > 0;

  return (
    <div className="card-hairline space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">New automation</h2>
        <button onClick={onClose} className="rounded-full p-1 text-foreground/50 hover:bg-black/5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="block text-xs font-medium text-foreground/70">
        Trigger keyword
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          maxLength={40}
          placeholder="LINK"
          className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/40"
        />
        <span className="mt-1 block font-normal text-foreground/45">
          Whole-word match, case-insensitive — "link" won't fire on "LinkedIn".
        </span>
      </label>

      <label className="block text-xs font-medium text-foreground/70">
        DM to send
        <textarea
          value={dmMessage}
          onChange={(e) => setDmMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Hey! Here's the link you asked for: https://…"
          className="mt-1 w-full resize-none rounded-xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/40"
        />
      </label>

      <label className="block text-xs font-medium text-foreground/70">
        Public comment reply <span className="font-normal text-foreground/45">(optional)</span>
        <input
          value={publicReply}
          onChange={(e) => setPublicReply(e.target.value)}
          maxLength={2200}
          placeholder="Sent! Check your DMs 💌"
          className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/10 placeholder:text-foreground/40 focus:ring-violet/40"
        />
      </label>

      <label className="block text-xs font-medium text-foreground/70">
        Applies to
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/10 focus:ring-violet/40"
        >
          <option value="">All posts</option>
          {posts.map((p) => (
            <option key={p.ig_media_id} value={p.ig_media_id}>
              {captionPreview(p.caption)}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <button onClick={save} disabled={saving || !valid} className="btn-glow !px-4 !py-2 text-sm disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Create automation
      </button>
    </div>
  );
}

export default function DMAutomationPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [automations, setAutomations] = useState<DMFunnel[]>([]);
  const [sends, setSends] = useState<DMFunnelSend[]>([]);
  const [posts, setPosts] = useState<{ ig_media_id: string; caption: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [automationsRes, sendsRes] = await Promise.all([
        api.get<DMFunnelListResponse>("/instagram/dm-funnels"),
        api.get<DMFunnelSendsResponse>("/instagram/dm-funnels/sends"),
      ]);
      setAutomations(automationsRes.data.funnels);
      setSends(sendsRes.data.sends);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        const profile = await api.get("/instagram/profile").then(() => true).catch(() => false);
        if (!profile) {
          navigate("/connect", { replace: true });
          return;
        }
      }
      setError(errorMessage(err, "Could not load your automations"));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
    safeGet<MediaListResponse>("/instagram/media", { page: 1, page_size: 24 }).then((r) => {
      if (r) setPosts(r.items.map((m) => ({ ig_media_id: m.ig_media_id, caption: m.caption })));
    });
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function remove(funnelId: string) {
    if (!window.confirm("Delete this automation? Its send history is kept.")) return;
    try {
      await api.delete(`/instagram/dm-funnels/${funnelId}`);
      setAutomations((prev) => prev.filter((f) => f.funnel_id !== funnelId));
    } catch (err) {
      setError(errorMessage(err, "Could not delete the automation"));
    }
  }

  return (
    <DashboardLayout active="DM Automation" days={days} onDaysChange={setDays} onSync={sync} syncing={syncing}>
      <div className="mx-auto max-w-3xl space-y-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              DM Automation{" "}
              <span className="font-serif font-normal italic text-foreground/60">
                — comment a keyword, get a DM.
              </span>
            </h1>
            <p className="mt-1 text-sm text-foreground/55">
              Tell your audience to comment a word (e.g. "LINK") and InfluenceIQ DMs them your
              message automatically — comments feed the algorithm, DMs capture the lead.
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-glow !px-4 !py-2 text-sm">
              <Plus className="h-4 w-4" /> New automation
            </button>
          )}
        </div>

        {showForm && (
          <CreateAutomationForm
            posts={posts}
            onClose={() => setShowForm(false)}
            onCreated={(f) => {
              setAutomations((prev) => [...prev, f]);
              setShowForm(false);
            }}
          />
        )}

        {/* automation list */}
        {loading && automations.length === 0 ? (
          <ListSkeleton rows={5} />
        ) : automations.length === 0 ? (
          <div className="card-hairline p-5">
            <CardEmpty label='No automations yet. Create one, then tell followers to "comment LINK" in your next caption — new comments are checked every 15 minutes.' />
          </div>
        ) : (
          <ul className="space-y-3">
            {automations.map((f) => {
              const scopedPost = posts.find((p) => p.ig_media_id === f.ig_media_id);
              return (
                <li key={f.funnel_id} className="card-hairline p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lavender text-violet-deep">
                      <Workflow size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="chip !bg-ink !text-white uppercase tracking-wide">{f.keyword}</span>
                        <span className="text-foreground/45">
                          {f.ig_media_id
                            ? `on “${captionPreview(scopedPost?.caption ?? f.ig_media_id)}”`
                            : "on all posts"}
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600">
                          <Send className="h-3 w-3" /> <span className="num">{f.sent_count}</span> sent
                        </span>
                        {f.failed_count > 0 && (
                          <span className="flex items-center gap-1 text-rose-500">
                            <AlertCircle className="h-3 w-3" /> <span className="num">{f.failed_count}</span> failed
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-foreground/75">
                        <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
                        {f.dm_message}
                      </p>
                      {f.public_reply && (
                        <p className="mt-1 text-xs text-foreground/50">Public reply: “{f.public_reply}”</p>
                      )}
                    </div>
                    <button
                      onClick={() => remove(f.funnel_id)}
                      className="rounded-full p-1.5 text-foreground/40 transition hover:bg-red-50 hover:text-red-500"
                      title="Delete automation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* activity feed */}
        {sends.length > 0 && (
          <div className="card-hairline p-5">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <ul className="mt-3 space-y-2.5">
              {sends.slice(0, 20).map((s) => (
                <li key={`${s.funnel_id}-${s.ig_comment_id}`} className="flex items-start gap-2 text-xs">
                  {s.status === "sent" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                  )}
                  <span className="min-w-0 flex-1 text-foreground/70">
                    <span className="font-semibold text-foreground">@{s.commenter_username}</span>{" "}
                    commented “{captionPreview(s.comment_text)}” →{" "}
                    {s.status === "sent" ? (
                      <>DM sent via <span className="uppercase">{s.keyword}</span></>
                    ) : (
                      <span className="text-rose-500">{s.error || "send failed"}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-foreground/40">{timeAgo(s.sent_at)} ago</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-foreground/45">
          Note: real DM delivery requires Meta Advanced Access on{" "}
          <code className="rounded bg-black/5 px-1">instagram_business_manage_messages</code> and only
          works within 7 days of a comment. Failed sends show the reason above.
        </p>
      </div>
    </DashboardLayout>
  );
}
