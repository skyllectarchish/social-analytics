import { useState, useEffect, useCallback } from "react";
import api from "../api/client";

export function useDashboard(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/instagram/insights/dashboard?days=${days}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [days]);

  return { data, loading, error };
}

export function useOverview(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/instagram/insights/overview?days=${days}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load overview"))
      .finally(() => setLoading(false));
  }, [days]);

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
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const trigger = useCallback(async () => {
    setSyncing(true);
    setSynced(false);
    try {
      // Step 1: Pull latest posts into the database
      await api.post("/instagram/refresh");
      // Step 2: Trigger the background sync for insights
      await api.post("/instagram/insights/sync");
      
      setSynced(true);
      setTimeout(() => setSynced(false), 3000);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }, []);

  return { syncing, synced, trigger };
}
