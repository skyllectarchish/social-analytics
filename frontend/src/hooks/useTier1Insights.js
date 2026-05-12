import { useState, useEffect } from "react";
import api from "../api/client";

function useFetch(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return;
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

// Feature 1: Content Format Breakdown
export function useFormatBreakdown(days = 90) {
  return useFetch(`/instagram/insights/format-breakdown?days=${days}`, [days]);
}

// Feature 2: Best Time to Post
export function useBestTime(days = 90, minSample = 3) {
  return useFetch(
    `/instagram/insights/best-time?days=${days}&min_sample=${minSample}`,
    [days, minSample],
  );
}

// Feature 3: Algorithm / Save+Share Metrics
export function useAlgorithmMetrics(days = 30) {
  return useFetch(`/instagram/insights/algorithm-metrics?days=${days}`, [days]);
}

export function useAlgorithmPosts(days = 30, limit = 20) {
  return useFetch(
    `/instagram/insights/algorithm-metrics/posts?days=${days}&limit=${limit}`,
    [days, limit],
  );
}

// Drill-down: posts within a single format
export function useFormatBreakdownPosts(format, days = 90, limit = 20) {
  return useFetch(
    format
      ? `/instagram/insights/format-breakdown/posts?format=${encodeURIComponent(format)}&days=${days}&limit=${limit}`
      : null,
    [format, days, limit],
  );
}

// Drill-down: posts within a single (day, hour) slot
export function useBestTimePosts(day, hour, days = 90) {
  const enabled = day !== null && day !== undefined && hour !== null && hour !== undefined;
  return useFetch(
    enabled
      ? `/instagram/insights/best-time/posts?day=${day}&hour=${hour}&days=${days}`
      : null,
    [day, hour, days],
  );
}

// Feature 4: Reels Retention
export function useReelsRetention(days = 90, limit = 50) {
  return useFetch(
    `/instagram/insights/reels-retention?days=${days}&limit=${limit}`,
    [days, limit],
  );
}

export function useReelsTrend(days = 180) {
  return useFetch(`/instagram/insights/reels-retention/trend?days=${days}`, [days]);
}

// Feature 5: Follower Quality
export function useFollowerQuality(breakdown = "age") {
  return useFetch(
    `/instagram/insights/follower-quality?breakdown=${breakdown}`,
    [breakdown],
  );
}

export function useFollowerQualitySummary(breakdown = "age") {
  return useFetch(
    `/instagram/insights/follower-quality/summary?breakdown=${breakdown}`,
    [breakdown],
  );
}

export function useFollowerSpikes(days = 90, threshold = 50) {
  return useFetch(
    `/instagram/insights/follower-quality/spikes?days=${days}&threshold=${threshold}`,
    [days, threshold],
  );
}
