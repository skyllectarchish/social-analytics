import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

// Shared fetch helper with AbortController + abort-aware setState so rapid
// dep changes (e.g. PeriodComparator spam) can't race the last-arrived
// response over the last-requested one.
function useAbortableGet(url, { onError } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
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
        if (onError) {
          onError(err, { setData, setError });
        } else {
          setError(err.response?.data?.detail || "Request failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, onError]);

  return { data, loading, error };
}

export function useDashboard() {
  const { days, compareTo } = usePeriodComparator();
  return useAbortableGet(
    buildUrl("/instagram/insights/dashboard", { days, compare_to: compareTo }),
  );
}

export function useOverview() {
  const { days, compareTo } = usePeriodComparator();
  return useAbortableGet(
    buildUrl("/instagram/insights/overview", { days, compare_to: compareTo }),
  );
}

export function useDemographics(metric, breakdown) {
  const url =
    metric && breakdown
      ? `/instagram/insights/demographics?metric=${encodeURIComponent(metric)}&breakdown=${encodeURIComponent(breakdown)}`
      : null;
  return useAbortableGet(url);
}

export function useMediaInsights(mediaId) {
  const url = mediaId ? `/instagram/insights/media/${encodeURIComponent(mediaId)}` : null;
  return useAbortableGet(url);
}

// 404s on conversion are expected (STORY / older posts); swallow them.
function swallow404(err, { setData, setError }) {
  if (err.response?.status === 404) {
    setData(null);
  } else {
    setError(err.response?.data?.detail || "Request failed");
  }
}

export function useMediaConversion(mediaId) {
  const url = mediaId ? `/instagram/insights/media/${encodeURIComponent(mediaId)}/conversion` : null;
  const { data, loading } = useAbortableGet(url, { onError: swallow404 });
  return { data, loading };
}

export function useStories() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get("/instagram/stories", { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setData(res.data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.response?.data?.detail || "Failed to load stories");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  const refetch = useCallback(() => setRefreshTick((t) => t + 1), []);

  return { data, loading, error, refetch };
}

export function useSyncInsights() {
  const { days } = usePeriodComparator();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState(null);
  const syncedTimerRef = useRef(null);

  // Clear any pending "reset synced flag" timer on unmount so we don't
  // setState after the consumer is gone.
  useEffect(() => () => {
    if (syncedTimerRef.current) clearTimeout(syncedTimerRef.current);
  }, []);

  const trigger = useCallback(async () => {
    setSyncing(true);
    setSynced(false);
    setError(null);
    try {
      await api.post("/instagram/refresh");
      const params = new URLSearchParams();
      if (days) params.set("lookback_days", String(days));
      params.set("purge", "true");
      await api.post(`/instagram/insights/sync?${params.toString()}`);

      setSynced(true);
      if (syncedTimerRef.current) clearTimeout(syncedTimerRef.current);
      syncedTimerRef.current = setTimeout(() => setSynced(false), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [days]);

  return { syncing, synced, error, trigger };
}
