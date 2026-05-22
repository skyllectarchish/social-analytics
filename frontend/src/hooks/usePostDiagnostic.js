import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import diagnosticFixture from "../api/__fixtures__/ai/diagnostic.json";

const USE_REAL = import.meta.env.VITE_AI_USE_REAL_API === "true";

export function usePostDiagnostic(igMediaId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notEligible, setNotEligible] = useState(false);
  const abortRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    if (!igMediaId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setNotEligible(false);

    if (!USE_REAL) {
      await new Promise((r) => setTimeout(r, 600));
      setData({ ...diagnosticFixture, ig_media_id: igMediaId });
      setLoading(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await api.post(
        "/ai/diagnose-post",
        { ig_media_id: igMediaId },
        { signal: controller.signal },
      );
      setData(res.data);
    } catch (err) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
      const status = err.response?.status;
      if (status === 422) {
        setNotEligible(true);
      } else {
        setError(err.response?.data?.detail || "Couldn't diagnose this post");
      }
    } finally {
      setLoading(false);
    }
  }, [igMediaId]);

  useEffect(() => {
    fetchOnce();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchOnce]);

  return { data, loading, error, notEligible, refresh: fetchOnce };
}
