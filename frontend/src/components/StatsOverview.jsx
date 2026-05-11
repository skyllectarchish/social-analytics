function StatCard({ label, value, cardClass, iconGradient }) {
  const formatted = typeof value === "number"
    ? value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}K`
      : value.toString()
    : value;

  return (
    <div className={`metric-card ${cardClass} animate-count`}>
      <div
        className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
        style={{ background: iconGradient }}
      >
        <div className="w-4 h-4 rounded-full bg-white opacity-90" />
      </div>
      <p className="font-display text-3xl font-semibold text-[#0a0e27] mb-1">{formatted}</p>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
    </div>
  );
}

export default function StatsOverview({ profile }) {
  const stats = [
    { label: "Followers", value: profile.followers_count, cardClass: "card-lavender", iconGradient: "linear-gradient(135deg, #8b5cf6, #c084fc)" },
    { label: "Following", value: profile.follows_count, cardClass: "card-pink", iconGradient: "linear-gradient(135deg, #ec4899, #fb923c)" },
    { label: "Posts", value: profile.media_count, cardClass: "card-mint", iconGradient: "linear-gradient(135deg, #10b981, #8b5cf6)" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((s) => <StatCard key={s.label} {...s} />)}
    </div>
  );
}
