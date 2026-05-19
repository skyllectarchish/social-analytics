import { useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

function useGet(url, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get(url)
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setData(null);
        } else {
          setError(err.response?.data?.detail || "Request failed");
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

export function useSentimentSummary() {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/sentiment", {
    days,
    compare_to: compareTo,
  });
  return useGet(url, [days, compareTo]);
}

export function useTopics() {
  const { days } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/sentiment/topics", { days });
  return useGet(url, [days]);
}

export function useQuestionPosts(limit = 10) {
  const { days } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/sentiment/questions", {
    days,
    limit,
  });
  return useGet(url, [days, limit]);
}

export function useMediaSentiment(mediaId) {
  const url = mediaId
    ? `/instagram/insights/sentiment/media/${encodeURIComponent(mediaId)}`
    : null;
  return useGet(url, [mediaId]);
}

export function useSentimentDiagnose(refreshKey = 0) {
  // refreshKey lets the parent force a re-fetch after seeding demo data.
  return useGet("/instagram/insights/sentiment/diagnose", [refreshKey]);
}

export function useSeedSentimentDemo() {
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const trigger = async () => {
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
  };

  return { trigger, seeding, error, result };
}
