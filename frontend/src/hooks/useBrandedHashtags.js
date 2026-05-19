import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { usePeriodComparator } from "../context/PeriodComparatorContext";

export function useBrandedHashtags() {
  const { days } = usePeriodComparator();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get(`/instagram/branded-hashtags?days=${encodeURIComponent(days)}`)
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setData(null);
        } else {
          setError(err.response?.data?.detail || "Request failed");
        }
      })
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(
    async (hashtag) => {
      try {
        await api.post("/instagram/branded-hashtags", { hashtag });
        load();
      } catch (err) {
        throw new Error(err.response?.data?.detail || "Add failed");
      }
    },
    [load],
  );

  const remove = useCallback(
    async (hashtag) => {
      try {
        await api.delete(
          `/instagram/branded-hashtags/${encodeURIComponent(hashtag)}`,
        );
        load();
      } catch (err) {
        throw new Error(err.response?.data?.detail || "Remove failed");
      }
    },
    [load],
  );

  return { data, loading, error, add, remove, refresh: load };
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
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get(
        `/instagram/branded-hashtags/${encodeURIComponent(
          hashtag,
        )}/mentions?days=${encodeURIComponent(days)}`,
      )
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setData(null);
        } else {
          setError(err.response?.data?.detail || "Request failed");
        }
      })
      .finally(() => setLoading(false));
  }, [hashtag, days]);

  return { data, loading, error };
}
