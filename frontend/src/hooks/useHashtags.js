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
        // Endpoint may not exist yet — treat 404 as empty data instead of an error.
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

export function useTopHashtags(limit = 30, minUses = 2) {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/hashtags", {
    days,
    limit,
    min_uses: minUses,
    compare_to: compareTo,
  });
  return useGet(url, [days, limit, minUses, compareTo]);
}

export function useHashtagTrend(tag) {
  const { days, compareTo } = usePeriodComparator();
  const url = tag
    ? buildUrl("/instagram/insights/hashtags/trend", {
        tag,
        days,
        compare_to: compareTo,
      })
    : null;
  return useGet(url, [tag, days, compareTo]);
}

export function useHashtagCombos(minUses = 2) {
  const { days, compareTo } = usePeriodComparator();
  const url = buildUrl("/instagram/insights/hashtags/combos", {
    days,
    min_uses: minUses,
    compare_to: compareTo,
  });
  return useGet(url, [days, minUses, compareTo]);
}
