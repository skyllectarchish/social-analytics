import { useState, useEffect } from "react";
import api from "../api/client";

/**
 * Load a media thumbnail through the backend image proxy
 * (`GET /instagram/media/:id/image`) and expose it as a blob: URL.
 *
 * We can't point a bare <img src> at the proxy because it's an authenticated
 * endpoint and the browser won't attach the bearer token to a plain image
 * request. Fetching through the axios client (which injects the token) and
 * wrapping the bytes in an object URL keeps auth intact AND makes the image a
 * same-origin resource, sidestepping the tracker blockers / cross-origin rules
 * that leave direct cdninstagram.com <img> tags blank.
 *
 * @param {string|undefined} mediaId - ig_media_id to proxy.
 * @returns {{ src: string|null, failed: boolean }}
 */
export function useMediaImage(mediaId) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mediaId) {
      setSrc(null);
      setFailed(true);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    setSrc(null);
    setFailed(false);

    api
      .get(`/instagram/media/${encodeURIComponent(mediaId)}/image`, {
        responseType: "blob",
      })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  return { src, failed };
}
