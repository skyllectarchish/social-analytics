import { useState } from "react";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import api from "../../api/client";
import type { FeedbackRequest } from "../../api/types";
import { trackAI } from "../../lib/telemetry";

// Thumbs up/down wired to POST /ai/feedback. Optimistic, reverts on failure,
// flashes a "Thanks" confirmation. Idempotent server-side per (feature, ref).
export default function AIFeedback({ feature, refId }: { feature: FeedbackRequest["feature"]; refId: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [thanks, setThanks] = useState(false);

  async function send(r: "up" | "down") {
    const prev = rating;
    setRating(r);
    try {
      await api.post("/ai/feedback", { feature, ref_id: refId, rating: r } satisfies FeedbackRequest);
      trackAI(feature, "feedback_submitted", { refId, meta: { rating: r } });
      setThanks(true);
      window.setTimeout(() => setThanks(false), 1600);
    } catch {
      setRating(prev);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => send("up")}
        aria-label="Helpful"
        className={`rounded-lg p-1.5 transition ${rating === "up" ? "bg-emerald-50 text-emerald-600" : "text-foreground/35 hover:bg-black/5 hover:text-foreground/70"}`}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => send("down")}
        aria-label="Not helpful"
        className={`rounded-lg p-1.5 transition ${rating === "down" ? "bg-rose-50 text-rose-500" : "text-foreground/35 hover:bg-black/5 hover:text-foreground/70"}`}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {thanks && (
        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
          <Check className="h-3 w-3" /> Thanks
        </span>
      )}
    </span>
  );
}
