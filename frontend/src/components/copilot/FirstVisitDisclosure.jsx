import { useEffect, useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import AppModal from "../shared/AppModal";
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
    <AppModal
      open={open}
      onClose={accept}
      title="A quick note on Copilot"
      icon={Sparkles}
      size="sm"
      staticBackdrop
      bodyClassName="px-6 py-5 space-y-4"
    >
      <p className="text-[13px] text-slate-600 leading-relaxed">
        Copilot summarizes your post and comment data with an AI model.
        Captions and comments may be sent to that model. We do not share your
        data publicly or sell it.
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
        className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
          border: "none",
          boxShadow: "0 4px 16px rgba(109,40,217,0.25)",
        }}
      >
        Got it
      </button>
    </AppModal>
  );
}
