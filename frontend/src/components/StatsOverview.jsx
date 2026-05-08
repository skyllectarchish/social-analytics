function StatCard({ label, value, gradient }) {
  const formatted = typeof value === "number"
    ? value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}K`
      : value.toString()
    : value;

  return (
    <div className="rounded-2xl p-6 animate-count"
      style={{
        background: "oklch(0.18 0.02 275)",
        border: "1px solid oklch(0.30 0.04 275)",
        boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)",
      }}>
      <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
        style={{ background: gradient }}>
        <div className="w-4 h-4 rounded-full bg-white opacity-90" />
      </div>
      <p className="text-3xl font-bold mb-1" style={{ color: "oklch(0.95 0.01 275)" }}>{formatted}</p>
      <p className="text-sm" style={{ color: "oklch(0.65 0.02 275)" }}>{label}</p>
    </div>
  );
}

export default function StatsOverview({ profile }) {
  const stats = [
    { label: "Followers", value: profile.followers_count, gradient: "linear-gradient(135deg, oklch(0.65 0.25 275), oklch(0.75 0.20 330))" },
    { label: "Following", value: profile.follows_count, gradient: "linear-gradient(135deg, oklch(0.75 0.20 330), oklch(0.65 0.25 25))" },
    { label: "Posts", value: profile.media_count, gradient: "linear-gradient(135deg, oklch(0.72 0.20 150), oklch(0.65 0.25 275))" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((s) => <StatCard key={s.label} {...s} />)}
    </div>
  );
}
