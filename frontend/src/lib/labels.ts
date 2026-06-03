// Human-facing labels for Instagram media types.
// Per product naming: video → "Reel", carousel → "Post".
export function mediaLabel(type?: string | null): string {
  if (!type) return "Post";
  const t = type.toUpperCase();
  if (t === "VIDEO" || t === "REEL" || t === "REELS") return "Reel";
  if (t.startsWith("CAROUSEL")) return "Post";
  if (t === "IMAGE" || t === "FEED" || t === "PHOTO") return "Photo";
  if (t === "STORY") return "Story";
  return type.charAt(0) + type.slice(1).toLowerCase();
}
