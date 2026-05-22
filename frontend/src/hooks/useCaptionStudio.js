import { useCallback, useState } from "react";
import api from "../api/client";
import captionFixture from "../api/__fixtures__/ai/caption.json";

const USE_REAL = import.meta.env.VITE_AI_USE_REAL_API === "true";

export function useCaptionStudio() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);

  const score = useCallback(async ({ draft, format = "REELS", topic_hint }) => {
    setLoading(true);
    setError(null);
    setQuotaBlocked(false);

    if (!USE_REAL) {
      await new Promise((r) => setTimeout(r, 500));
      const next = {
        ...captionFixture,
        draft,
        variants: captionFixture.variants.map((v) => ({ ...v })),
      };
      setResult(next);
      setLoading(false);
      return next;
    }

    try {
      const res = await api.post("/ai/caption/suggest", {
        draft,
        format,
        topic_hint,
      });
      setResult(res.data);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setQuotaBlocked(true);
      } else {
        setError(err.response?.data?.detail || "Couldn't analyze the caption");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setQuotaBlocked(false);
  }, []);

  return { result, loading, error, quotaBlocked, score, reset };
}
