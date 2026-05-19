import { useState, useEffect, useCallback } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

function buildUrl(base, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

export function useDashboard() {
  const { days, compareTo } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get(buildUrl("/instagram/insights/dashboard", { days, compare_to: compareTo }))
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [days, compareTo]);

  return { data, loading, error };
}

export function useOverview() {
  const { days, compareTo } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get(buildUrl("/instagram/insights/overview", { days, compare_to: compareTo }))
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load overview"))
      .finally(() => setLoading(false));
  }, [days, compareTo]);

  return { data, loading, error };
}

export function useDemographics(metric, breakdown) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!metric || !breakdown) return;
    setLoading(true);
    setError(null);
    api.get(`/instagram/insights/demographics?metric=${metric}&breakdown=${breakdown}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load demographics"))
      .finally(() => setLoading(false));
  }, [metric, breakdown]);

  return { data, loading, error };
}

export function useMediaInsights(mediaId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mediaId) return;
    setLoading(true);
    setError(null);
    api.get(`/instagram/insights/media/${mediaId}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load media insights"))
      .finally(() => setLoading(false));
  }, [mediaId]);

  return { data, loading, error };
}

export function useMediaConversion(mediaId) {
  // Conversion is only computable for FEED/REELS posts inside the
  // attribution window — the endpoint 404s for STORY / older posts. We
  // swallow 404 so the drawer just hides the section in that case.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mediaId) return;
    setLoading(true);
    setData(null);
    api
      .get(`/instagram/insights/media/${mediaId}/conversion`)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [mediaId]);

  return { data, loading };
}

export function useStories() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get("/instagram/stories")
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load stories"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

export function useSyncInsights() {
  const { days } = usePeriodComparator();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const trigger = useCallback(async () => {
    setSyncing(true);
    setSynced(false);
    try {
      await api.post("/instagram/refresh");
      const params = new URLSearchParams();
      if (days) params.set("lookback_days", String(days));
      params.set("purge", "true");
      await api.post(`/instagram/insights/sync?${params.toString()}`);

      setSynced(true);
      setTimeout(() => setSynced(false), 3000);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }, [days]);

  return { syncing, synced, trigger };
}
