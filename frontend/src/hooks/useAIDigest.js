import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { openAIStream } from "../api/aiStream";
import digestFixture from "../api/__fixtures__/ai/digest.json";

const USE_REAL = import.meta.env.VITE_AI_USE_REAL_API === "true";
const STREAM_SIMULATION_MS = 28; // per-chunk delay in fixture streaming mode

// Splits the fixture narrative into ~3-char chunks so the simulated stream
// looks token-ish in dev without backend.
function chunkText(text, size = 3) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

export function useAIDigest(weekOf) {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!USE_REAL) {
      // Simulate cached digest delivery with a short delay.
      await new Promise((r) => setTimeout(r, 200));
      setDigest({ ...digestFixture, week_of: weekOf || digestFixture.week_of });
      setLoading(false);
      return;
    }
    try {
      const params = weekOf ? { week_of: weekOf } : {};
      const res = await api.get("/ai/digest/weekly", { params });
      setDigest(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setDigest(null);
      } else {
        setError(err.response?.data?.detail || "Couldn't load digest");
      }
    } finally {
      setLoading(false);
    }
  }, [weekOf]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  const regenerate = useCallback(async () => {
    setIsStreaming(true);
    setStreamingText("");
    setError(null);

    if (!USE_REAL) {
      const chunks = chunkText(digestFixture.narrative_md);
      for (const chunk of chunks) {
        await new Promise((r) => setTimeout(r, STREAM_SIMULATION_MS));
        setStreamingText((prev) => prev + chunk);
      }
      setDigest({
        ...digestFixture,
        week_of: weekOf || digestFixture.week_of,
        cached: false,
        generated_at: new Date().toISOString(),
      });
      setStreamingText("");
      setIsStreaming(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.post("/ai/digest/regenerate", { week_of: weekOf });
      for await (const evt of openAIStream("/ai/digest/stream", {
        params: weekOf ? { week_of: weekOf } : undefined,
        signal: controller.signal,
      })) {
        if (evt.event === "token") {
          setStreamingText((prev) => prev + (evt.data?.text ?? ""));
        } else if (evt.event === "done") {
          await fetchOnce();
          setStreamingText("");
          setIsStreaming(false);
          return;
        } else if (evt.event === "error") {
          setError(evt.data?.message || "Streaming failed");
          setIsStreaming(false);
          return;
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.response?.data?.detail || err.message || "Regenerate failed");
      }
    } finally {
      setIsStreaming(false);
    }
  }, [weekOf, fetchOnce]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return {
    digest,
    loading,
    error,
    isStreaming,
    streamingText,
    regenerate,
    refresh: fetchOnce,
  };
}
