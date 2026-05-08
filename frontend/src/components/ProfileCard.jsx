export default function ProfileCard({ profile }) {
  return (
    <div className="rounded-2xl p-6 animate-fade-in"
      style={{
        background: "oklch(0.18 0.02 275)",
        border: "1px solid oklch(0.30 0.04 275)",
        boxShadow: "0 4px 24px oklch(0 0 0 / 0.4)",
      }}>
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full p-0.5"
            style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
            {profile.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={profile.username}
                className="w-full h-full rounded-full object-cover"
                style={{ border: "2px solid oklch(0.18 0.02 275)" }}
              />
            ) : (
              <div className="w-full h-full rounded-full flex items-center justify-center"
                style={{ background: "oklch(0.25 0.03 275)", border: "2px solid oklch(0.18 0.02 275)" }}>
                <span className="text-2xl font-bold" style={{ color: "oklch(0.65 0.25 275)" }}>
                  {profile.username?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate" style={{ color: "oklch(0.95 0.01 275)" }}>
            {profile.name || profile.username}
          </h2>
          <p className="text-sm mb-1" style={{ color: "oklch(0.65 0.25 275)" }}>@{profile.username}</p>
          {profile.biography && (
            <p className="text-sm leading-relaxed" style={{ color: "oklch(0.70 0.02 275)" }}>
              {profile.biography}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
