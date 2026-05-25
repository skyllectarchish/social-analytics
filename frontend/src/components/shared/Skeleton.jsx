export function SkeletonCard({ className = "", height = "h-48" }) {
  return (
    <div className={`d-card ${height} ${className} overflow-hidden relative`}>
      <div className="absolute inset-0 shimmer-line" />
    </div>
  );
}

export function SkeletonMetric() {
  return (
    <div className="flex flex-col gap-2 p-5">
      <div className="h-3 w-16 rounded bg-slate-100" />
      <div className="h-8 w-24 rounded bg-slate-100 shimmer-line" />
      <div className="h-3 w-12 rounded bg-slate-50" />
    </div>
  );
}

// Stable pseudo-random bar heights so the skeleton doesn't reshuffle on every
// parent re-render (which is distracting in a "loading" state).
const SKELETON_BAR_HEIGHTS = [38, 58, 42, 72, 50, 64, 46, 78, 52, 60, 44, 70];

export function SkeletonChart({ height = "h-64" }) {
  return (
    <div className={`d-card p-5 ${height} flex flex-col`}>
      <div className="h-4 w-32 rounded bg-slate-100 mb-4" />
      <div className="flex-1 flex items-end gap-2 px-4 pb-4">
        {SKELETON_BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-slate-50 shimmer-line"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}
