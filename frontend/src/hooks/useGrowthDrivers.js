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

export function useGrowthDrivers(limit = 10) {
  const { days } = usePeriodComparator();
  return useGet(buildUrl("/instagram/insights/growth-drivers", { days, limit }));
}

export function useGrowthCorrelation() {
  const { days } = usePeriodComparator();
  return useGet(buildUrl("/instagram/insights/growth-correlation", { days }));
}
