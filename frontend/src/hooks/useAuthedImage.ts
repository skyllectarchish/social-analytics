import { useEffect, useState } from "react";
import api from "../api/client";

// The /instagram/media/{id}/image proxy requires the Bearer token, so a bare
// <img src> can't load it. Fetch the bytes as a blob and hand back an object URL.
export function useAuthedImage(igMediaId: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!igMediaId) return;
    let url: string | null = null;
    let cancelled = false;

    api
      .get(`/instagram/media/${igMediaId}/image`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data as Blob);
        setSrc(url);
      })
      .catch(() => {
        /* leave src null → caller shows a placeholder */
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [igMediaId]);

  return src;
}
