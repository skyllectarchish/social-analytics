import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import ideasFixture from "../api/__fixtures__/ai/ideas.json";

const USE_REAL = import.meta.env.VITE_AI_USE_REAL_API === "true";

export function useContentIdeas({ days = 90, limit = 5 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOnce = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!USE_REAL) {
      await new Promise((r) => setTimeout(r, 220));
      setData({
        ...ideasFixture,
        period_days: days,
        ideas: ideasFixture.ideas.slice(0, Math.max(1, limit)),
      });
      setLoading(false);
      return;
    }
    try {
      const res = await api.get("/ai/ideas", { params: { days, limit } });
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setData(null);
      } else {
        setError(err.response?.data?.detail || "Couldn't load ideas");
      }
    } finally {
      setLoading(false);
    }
  }, [days, limit]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { data, loading, error, refresh: fetchOnce };
}
