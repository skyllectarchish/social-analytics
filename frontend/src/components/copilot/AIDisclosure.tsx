import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, Sparkles } from "lucide-react";
import { trackAI } from "../../lib/telemetry";

const ACK_KEY = "ai_disclosure_acked_v1";

export function aiDisclosureAcked(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return true;
  }
}

// One-time modal explaining what data the AI features see, shown before the
// first visit to the Copilot page.
export default function AIDisclosure({ onAck }: { onAck: () => void }) {
  const [open, setOpen] = useState(true);

  function ack() {
    try { localStorage.setItem(ACK_KEY, "1"); } catch { /* private mode */ }
    trackAI("copilot_nav", "disclosure_acked");
    setOpen(false);
    onAck();
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[rgba(10,14,39,0.4)] backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-label="AI features disclosure"
          >
            <span className="bg-ig grid h-10 w-10 place-items-center rounded-2xl text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-lg font-semibold">Before you use the AI Copilot</h2>
            <p className="mt-1.5 text-sm text-foreground/65">
              InfluenceIQ summarizes your post and comment data with an AI model. Captions and comments may
              be sent to that model. We do not share your data publicly or sell it.
            </p>
            <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 ring-1 ring-emerald-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              You can purge stored AI history at any time from your account settings.
            </p>
            <button onClick={ack} className="btn-glow mt-4 w-full justify-center !py-2.5 text-sm">
              Got it
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
