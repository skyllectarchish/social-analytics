import { useMediaImage } from "../../hooks/useMediaImage";

/**
 * Render a post thumbnail through the same-origin backend image proxy
 * (`GET /instagram/media/:id/image`) instead of pointing <img> straight at
 * cdninstagram.com — which tracker blockers / cross-origin rules leave blank.
 *
 * Resolves the image by `mediaId` (ig_media_id) against the user's stored
 * media, so it works for the user's own posts/reels. While loading or if the
 * proxy fails (or no mediaId), it renders `fallback` instead.
 *
 * Drop-in for the common `{x.thumbnail_url ? <img .../> : <placeholder/>}`
 * pattern: pass the same className/style the <img> used and the placeholder as
 * `fallback`.
 */
export default function MediaThumb({ mediaId, alt = "", className, style, fallback = null }) {
  const { src } = useMediaImage(mediaId);
  if (!src) return fallback;
  return (
    <img src={src} alt={alt} className={className} style={style} loading="lazy" />
  );
}
