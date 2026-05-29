import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ShieldCheck } from "lucide-react";
import { trackAI } from "../../utils/telemetry";

const ACK_KEY = "ai_disclosure_acked_v1";

export function hasAckedDisclosure() {
  try {
    return !!localStorage.getItem(ACK_KEY);
  } catch {
    return true; // fail-open: if storage isn't available, don't gate
  }
}

export function ackDisclosure() {
  try {
    localStorage.setItem(ACK_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

/**
 * Mount once per session at the top of any AI-surface page. Shows a modal
 * the first time the user lands; remembers ack via localStorage. Triggers
 * `onAck` after the user confirms so the page can fire its `viewed` event
 * cleanly afterwards.
 */
export default function FirstVisitDisclosure({ onAck }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasAckedDisclosure()) setOpen(true);
  }, []);

  const accept = () => {
    ackDisclosure();
    trackAI("copilot_nav", "disclosure_acked");
    setOpen(false);
    onAck?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.36)", backdropFilter: "blur(8px)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-disclosure-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(236,72,153,0.12))",
                  color: "#7c3aed",
                }}
              >
                <Sparkles size={18} />
              </div>
              <h2
                id="ai-disclosure-title"
                className="text-base font-semibold text-slate-900"
              >
                A quick note on InsightIQ
              </h2>
            </div>

            <p className="text-[13px] text-slate-600 leading-relaxed">
              InsightIQ summarizes your post and comment data with an AI model.
              Captions and comments may be sent to that model. We do not share
              your data publicly or sell it.
            </p>

            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.18)",
              }}
            >
              <ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-emerald-800 leading-relaxed">
                You can clear AI history at any time from Settings.
              </p>
            </div>

            <button
              type="button"
              onClick={accept}
              autoFocus
              className="w-full py-2 rounded-lg text-[13px] font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                border: "none",
                boxShadow: "0 4px 16px rgba(109,40,217,0.25)",
              }}
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
