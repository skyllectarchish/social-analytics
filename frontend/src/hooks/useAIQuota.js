import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import quotaFixture from "../api/__fixtures__/ai/quota.json";

// Phase A: hook returns a fixture unless VITE_AI_USE_REAL_API is set, so the
// UI can be built and exercised before /api/ai/quota exists. When the real
// endpoint lands, flip the env var and the GET path takes over.
const USE_REAL = import.meta.env.VITE_AI_USE_REAL_API === "true";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useAIQuota() {
  const [data, setData] = useState(USE_REAL ? null : quotaFixture);
  const [loading, setLoading] = useState(USE_REAL);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const fetchQuota = useCallback(async () => {
    if (!USE_REAL) {
      setData(quotaFixture);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await api.get("/ai/quota");
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        // endpoint not yet deployed — fall back to fixture so UI keeps working
        setData(quotaFixture);
      } else {
        setError(err.response?.data?.detail || "Couldn't load AI quota");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
    pollRef.current = setInterval(fetchQuota, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchQuota]);

  const used = data?.used ?? 0;
  const limit = data?.limit ?? 0;
  // Cap at 100 so a counting bug or a multi-worker race that lets `used`
  // briefly exceed `limit` doesn't fill the badge bar past its track.
  const percentUsed = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const exhausted = limit > 0 && used >= limit;

  return {
    data,
    loading,
    error,
    used,
    limit,
    resetsAt: data?.resets_at ?? null,
    percentUsed,
    exhausted,
    refresh: fetchQuota,
  };
}
