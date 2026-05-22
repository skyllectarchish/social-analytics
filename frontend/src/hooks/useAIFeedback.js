import { useCallback, useState } from "react";
import api from "../api/client";

const USE_REAL = import.meta.env.VITE_AI_USE_REAL_API === "true";

// Generic thumbs feedback poster. Optimistic UI; idempotent server-side by
// (feature, ref_id, user) so a repeat submit is a no-op.
export function useAIFeedback() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(async ({ feature, refId, rating, note }) => {
    setPending(true);
    setError(null);
    if (!USE_REAL) {
      await new Promise((r) => setTimeout(r, 120));
      setPending(false);
      return true;
    }
    try {
      await api.post("/ai/feedback", {
        feature,
        ref_id: refId,
        rating,
        note,
      });
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't submit feedback");
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { submit, pending, error };
}
