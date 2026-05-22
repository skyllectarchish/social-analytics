import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { useAIFeedback } from "../../hooks/useAIFeedback";
import { trackAI } from "../../utils/telemetry";

// Thumbs up/down feedback used by Digest, Ideas, Diagnostic, Caption.
// Optimistic UI; second click is a no-op (server enforces idempotency on
// feature + ref_id + user).
export default function AIFeedbackButtons({
  feature,
  refId,
  initialRating = null,
  promptLabel = "Was this useful?",
  align = "right",
}) {
  const { submit, pending } = useAIFeedback();
  const [rating, setRating] = useState(initialRating);
  const [acknowledged, setAcknowledged] = useState(false);

  const click = async (next) => {
    if (rating === next || pending) return;
    setRating(next);
    trackAI(feature, "feedback_submitted", {
      refId,
      meta: { rating: next, has_note: false },
    });
    const ok = await submit({ feature, refId, rating: next });
    if (ok) {
      setAcknowledged(true);
      setTimeout(() => setAcknowledged(false), 1600);
    } else {
      setRating(initialRating);
    }
  };

  const justifyClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <div className={`flex items-center gap-2 ${justifyClass}`} aria-label={promptLabel}>
      {acknowledged ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
          <Check size={12} /> Thanks for the feedback
        </span>
      ) : (
        <>
          <span className="text-[11px] text-slate-400 hidden sm:inline">{promptLabel}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => click("up")}
            aria-label="Rate up"
            aria-pressed={rating === "up"}
            className="w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors disabled:opacity-50"
            style={{
              background: rating === "up" ? "rgba(16,185,129,0.12)" : "transparent",
              color: rating === "up" ? "#10b981" : "#94a3b8",
              border: `1px solid ${rating === "up" ? "rgba(16,185,129,0.30)" : "rgba(15,23,42,0.10)"}`,
            }}
          >
            <ThumbsUp size={13} />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => click("down")}
            aria-label="Rate down"
            aria-pressed={rating === "down"}
            className="w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors disabled:opacity-50"
            style={{
              background: rating === "down" ? "rgba(244,63,94,0.10)" : "transparent",
              color: rating === "down" ? "#e11d48" : "#94a3b8",
              border: `1px solid ${rating === "down" ? "rgba(244,63,94,0.30)" : "rgba(15,23,42,0.10)"}`,
            }}
          >
            <ThumbsDown size={13} />
          </button>
        </>
      )}
    </div>
  );
}
