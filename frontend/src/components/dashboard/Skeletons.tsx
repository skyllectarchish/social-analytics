import type { CSSProperties } from "react";

// Shimmer skeletons that mirror the dashboard card shapes, shown while a
// page's initial fetch resolves (replaces the old single-spinner loading).

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function StatSkeleton() {
  return (
    <div className="card-hairline p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-2 h-3 w-14" />
    </div>
  );
}

export function ChartSkeleton({ className = "h-64" }: { className?: string }) {
  return (
    <div className="card-hairline p-5">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-1.5 h-3 w-24" />
      <div className={`mt-4 flex items-end gap-2 ${className}`}>
        {[35, 60, 45, 80, 55, 70, 40, 65, 50, 75, 30, 58].map((h, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// A list of rows (avatar + two text lines + trailing pill) — inbox, comment
// threads, funnel sends, automation rules.
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card-hairline divide-y divide-black/5 p-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
          <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// A responsive grid of media thumbnail cards — posts, stories, videos.
export function MediaGridSkeleton({
  items = 8,
  aspect = "aspect-square",
  cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
}: { items?: number; aspect?: string; cols?: string }) {
  return (
    <div className={`grid gap-3 ${cols}`}>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl ring-1 ring-black/5">
          <Skeleton className={`w-full ${aspect}`} />
          <div className="p-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="mt-1.5 h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Stacked text lines for generated / streamed content (AI scripts, diagnostics,
// digests). The last line is shortened to read like a paragraph.
export function TextBlockSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// Generic page shape: title, a row of stat cards, then chart cards.
export function PageSkeleton({ stats = 4, charts = 2 }: { stats?: number; charts?: number }) {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-3.5 w-96 max-w-full" />
      </div>
      {stats > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      )}
      <div className={`grid gap-4 ${charts > 1 ? "lg:grid-cols-2" : ""}`}>
        {Array.from({ length: charts }, (_, i) => (
          <ChartSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
