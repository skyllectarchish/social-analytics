import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { useCompetitors } from "../../hooks/useCompetitors";

const HANDLE_REGEX = /^[a-z0-9._]{1,30}$/;

export default function AddCompetitorDialog({ open, onClose }) {
  const { add } = useCompetitors();
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setHandle("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const clean = handle.replace(/^@/, "").trim().toLowerCase();
    if (!HANDLE_REGEX.test(clean)) {
      setError("Invalid handle. Use letters, numbers, dots, or underscores (max 30 chars).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await add(clean);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Couldn't add this account. Must be a public Business or Creator account.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(15,23,42,0.32)",
            backdropFilter: "blur(8px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                Add competitor
              </h2>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Instagram handle
                </span>
                <input
                  autoFocus
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@handle"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-violet-400 text-sm"
                  style={{
                    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)",
                  }}
                />
              </label>
              <p className="text-[11px] text-slate-400">
                Must be a public Business or Creator account. Private and
                personal accounts cannot be tracked.
              </p>
              {error && (
                <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !handle.trim()}
                className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
                style={{
                  background:
                    submitting || !handle.trim()
                      ? "#cbd5e1"
                      : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  color: "#fff",
                  cursor: submitting || !handle.trim() ? "not-allowed" : "pointer",
                  boxShadow:
                    submitting || !handle.trim()
                      ? "none"
                      : "0 4px 16px rgba(109,40,217,0.25), 0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Add competitor
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
