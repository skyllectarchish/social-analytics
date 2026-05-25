import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

export function useBrandedHashtags() {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get("/instagram/branded-hashtags", { params: { days }, signal: controller.signal })
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
  }, [days, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  const add = useCallback(
    async (hashtag) => {
      try {
        await api.post("/instagram/branded-hashtags", { hashtag });
        refresh();
      } catch (err) {
        throw new Error(err.response?.data?.detail || "Add failed");
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (hashtag) => {
      try {
        await api.delete(
          `/instagram/branded-hashtags/${encodeURIComponent(hashtag)}`,
        );
        refresh();
      } catch (err) {
        throw new Error(err.response?.data?.detail || "Remove failed");
      }
    },
    [refresh],
  );

  return { data, loading, error, add, remove, refresh };
}

export function useBrandedHashtagMentions(hashtag) {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hashtag) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get(
        `/instagram/branded-hashtags/${encodeURIComponent(hashtag)}/mentions`,
        { params: { days }, signal: controller.signal },
      )
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
  }, [hashtag, days]);

  return { data, loading, error };
}
