import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, Search, UserPlus } from "lucide-react";
import AppModal from "../shared/AppModal";
import { useCompetitors, lookupCompetitor } from "../../hooks/useCompetitors";

const HANDLE_REGEX = /^[a-z0-9._]{1,30}$/;
const LOOKUP_DEBOUNCE_MS = 450;

function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export default function AddCompetitorDialog({ open, onClose }) {
  const { add } = useCompetitors();
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Lookup state machine: idle | invalid | searching | found | not_found | error
  const [lookupState, setLookupState] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [lookupMessage, setLookupMessage] = useState(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setHandle("");
      setSubmitError(null);
      setSubmitting(false);
      setLookupState("idle");
      setPreview(null);
      setLookupMessage(null);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  // Debounced live lookup on Instagram as the user types.
  useEffect(() => {
    const clean = handle.replace(/^@/, "").trim().toLowerCase();

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (clean === "") {
      setLookupState("idle");
      setPreview(null);
      setLookupMessage(null);
      return;
    }
    if (!HANDLE_REGEX.test(clean)) {
      setLookupState("invalid");
      setPreview(null);
      setLookupMessage(
        "Use letters, numbers, dots, or underscores (max 30 chars).",
      );
      return;
    }

    setLookupState("searching");
    setLookupMessage(null);
    setPreview(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const data = await lookupCompetitor(clean, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPreview(data);
        setLookupState("found");
        setLookupMessage(null);
      } catch (err) {
        if (controller.signal.aborted || err.code === "ERR_CANCELED") return;
        const status = err.response?.status;
        if (status === 404) {
          setLookupState("not_found");
          setLookupMessage(
            err.response?.data?.detail ||
              "Not found on Instagram, or not a public Business/Creator account.",
          );
        } else if (status === 400) {
          setLookupState("not_found");
          setLookupMessage(
            err.response?.data?.detail || "Instagram rejected this handle.",
          );
        } else {
          setLookupState("error");
          setLookupMessage(
            err.response?.data?.detail ||
              "Couldn't reach Instagram. Try again in a moment.",
          );
        }
        setPreview(null);
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [handle]);

  const submit = async (e) => {
    e.preventDefault();
    if (!preview || lookupState !== "found") return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await add(preview.handle);
      onClose();
    } catch (err) {
      setSubmitError(
        err.response?.data?.detail ||
          "Couldn't add this account. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = lookupState === "found" && !!preview && !submitting;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Add competitor"
      icon={UserPlus}
      size="sm"
      initialFocusRef={inputRef}
      bodyClassName="px-6 py-5"
    >
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Instagram handle
                </span>
                <div className="relative mt-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@handle"
                    className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 text-sm"
                    style={{
                      boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)",
                    }}
                  />
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  {lookupState === "searching" && (
                    <Loader2
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin"
                    />
                  )}
                  {lookupState === "found" && (
                    <CheckCircle2
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500"
                    />
                  )}
                  {(lookupState === "not_found" ||
                    lookupState === "invalid" ||
                    lookupState === "error") && (
                    <AlertCircle
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500"
                    />
                  )}
                </div>
              </label>

              <PreviewArea
                state={lookupState}
                preview={preview}
                message={lookupMessage}
              />

              <p className="text-[11px] text-slate-500">
                Looked up live on Instagram. Must be a public Business or
                Creator account — private and personal accounts cannot be
                tracked.
              </p>

              {submitError && (
                <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
                style={{
                  background: !canSubmit
                    ? "#cbd5e1"
                    : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  color: "#fff",
                  cursor: !canSubmit ? "not-allowed" : "pointer",
                  boxShadow: !canSubmit
                    ? "none"
                    : "0 4px 16px rgba(109,40,217,0.25), 0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {preview
                  ? `Track @${preview.username || preview.handle || ""}`
                  : "Add competitor"}
              </button>
            </form>
    </AppModal>
  );
}

function PreviewArea({ state, preview, message }) {
  if (state === "idle") return null;

  if (state === "searching") {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-lg">
        <Loader2 size={14} className="animate-spin text-slate-500" />
        <span>Looking up on Instagram…</span>
      </div>
    );
  }

  if (state === "invalid" || state === "not_found" || state === "error") {
    return (
      <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
        {message}
      </p>
    );
  }

  if (state === "found" && preview) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 bg-emerald-50/60 border border-emerald-100 px-3 py-2.5 rounded-lg"
      >
        {preview.profile_picture_url ? (
          <img
            src={preview.profile_picture_url}
            alt=""
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full object-cover bg-slate-100"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-200 to-fuchsia-200" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {preview.display_name || `@${preview.username}`}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            @{preview.username} · {formatCount(preview.followers_count)} followers ·{" "}
            {formatCount(preview.media_count)} posts
          </div>
        </div>
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
      </motion.div>
    );
  }

  return null;
}
