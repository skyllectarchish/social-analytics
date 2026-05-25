import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

function useGet(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get(url, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setData(res.data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err.response?.status === 404) {
          setData(null);
        } else {
          setError(err.response?.data?.detail || "Request failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url]);

  return { data, loading, error };
}

export function useSentimentSummary() {
  const { days, compareTo } = usePeriodComparator();
  return useGet(
    buildUrl("/instagram/insights/sentiment", { days, compare_to: compareTo }),
  );
}

export function useTopics() {
  const { days } = usePeriodComparator();
  return useGet(buildUrl("/instagram/insights/sentiment/topics", { days }));
}

export function useQuestionPosts(limit = 10) {
  const { days } = usePeriodComparator();
  return useGet(
    buildUrl("/instagram/insights/sentiment/questions", { days, limit }),
  );
}

export function useMediaSentiment(mediaId) {
  const url = mediaId
    ? `/instagram/insights/sentiment/media/${encodeURIComponent(mediaId)}`
    : null;
  return useGet(url);
}

export function useSentimentDiagnose(refreshKey = 0) {
  // Use refreshKey as a URL-level cache buster so callers can force a re-fetch
  // (e.g. after seeding demo data) by bumping it — the useGet effect re-runs
  // whenever the URL string changes.
  const url = refreshKey
    ? `/instagram/insights/sentiment/diagnose?_=${refreshKey}`
    : "/instagram/insights/sentiment/diagnose";
  return useGet(url);
}

export function useSeedSentimentDemo() {
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const trigger = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await api.post("/instagram/insights/sentiment/seed-demo");
      setResult(res.data);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.detail || "Seed failed";
      setError(msg);
      throw new Error(msg);
    } finally {
      setSeeding(false);
    }
  }, []);

  return { trigger, seeding, error, result };
}
