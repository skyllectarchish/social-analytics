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

function useGet(url, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOnce = useCallback(() => {
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
  }, [url]);

  useEffect(() => {
    fetchOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh: fetchOnce };
}

export function useCompetitors() {
  const { data, loading, error, refresh } = useGet("/instagram/competitors", []);

  const add = useCallback(
    async (handle) => {
      await api.post("/instagram/competitors", { handle });
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (handle) => {
      await api.delete(`/instagram/competitors/${encodeURIComponent(handle)}`);
      refresh();
    },
    [refresh],
  );

  return { data, loading, error, refresh, add, remove };
}

export async function lookupCompetitor(handle, { signal } = {}) {
  const res = await api.get("/instagram/competitors/lookup", {
    params: { handle },
    signal,
  });
  return res.data;
}

export function useCompetitorTimeline() {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/competitors/timeline", {
    days,
    compare_to: compareTo,
  });
  return useGet(url, [days, compareTo]);
}

export function useContentMix() {
  const { days } = usePeriodComparator();
  const url = buildUrl("/instagram/competitors/content-mix", { days });
  return useGet(url, [days]);
}
