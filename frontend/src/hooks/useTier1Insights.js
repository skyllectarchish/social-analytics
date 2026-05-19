import { useState, useEffect } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

function useFetch(url, deps = []) {
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
      .catch((err) => setError(err.response?.data?.detail || "Request failed"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, loading, error };
}

function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

// Feature 1: Content Format Breakdown
export function useFormatBreakdown() {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/format-breakdown", { days, compare_to: compareTo });
  return useFetch(url, [days, compareTo]);
}

// Feature 2: Best Time to Post
export function useBestTime(minSample = 1) {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/best-time", { days, min_sample: minSample, compare_to: compareTo });
  return useFetch(url, [days, minSample, compareTo]);
}

// Feature 3: Algorithm / Save+Share Metrics
export function useAlgorithmMetrics() {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/algorithm-metrics", { days, compare_to: compareTo });
  return useFetch(url, [days, compareTo]);
}

export function useAlgorithmPosts(limit = 20) {
  const { days } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/algorithm-metrics/posts", { days, limit });
  return useFetch(url, [days, limit]);
}

// Drill-down: posts within a single format
export function useFormatBreakdownPosts(format, limit = 20) {
  const { days } = usePeriodComparator();
  const url = format
    ? buildUrl("/instagram/insights/format-breakdown/posts", { format, days, limit })
    : null;
  return useFetch(url, [format, days, limit]);
}

// Drill-down: posts within a single (day, hour) slot
export function useBestTimePosts(day, hour) {
  const { days } = usePeriodComparator();
  const enabled = day !== null && day !== undefined && hour !== null && hour !== undefined;
  const url = enabled
    ? buildUrl("/instagram/insights/best-time/posts", { day, hour, days })
    : null;
  return useFetch(url, [day, hour, days]);
}

// Feature 4: Reels Retention
export function useReelsRetention(limit = 50) {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/reels-retention", { days, limit, compare_to: compareTo });
  return useFetch(url, [days, limit, compareTo]);
}

export function useReelsTrend(overrideDays) {
  const { days: ctxDays, compareTo } = usePeriodComparator();
  const days = overrideDays ?? Math.max(ctxDays, 180);
  const url = buildUrl("/instagram/insights/reels-retention/trend", { days, compare_to: compareTo });
  return useFetch(url, [days, compareTo]);
}

// Feature 5: Follower Quality (not period-scoped — uses breakdown)
export function useFollowerQuality(breakdown = "age") {
  const url = buildUrl("/instagram/insights/follower-quality", { breakdown });
  return useFetch(url, [breakdown]);
}

export function useFollowerQualitySummary(breakdown = "age") {
  const url = buildUrl("/instagram/insights/follower-quality/summary", { breakdown });
  return useFetch(url, [breakdown]);
}

export function useFollowerSpikes(threshold = 50) {
  const { days } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/follower-quality/spikes", { days, threshold });
  return useFetch(url, [days, threshold]);
}
