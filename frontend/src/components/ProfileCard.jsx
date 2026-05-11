export default function ProfileCard({ profile }) {
  return (
    <div
      className="glass rounded-2xl p-6 animate-fade-in"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div
            className="w-20 h-20 rounded-full p-0.5"
            style={{ background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}
          >
            {profile.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={profile.username}
                className="w-full h-full rounded-full object-cover border-2 border-white"
              />
            ) : (
              <div className="w-full h-full rounded-full flex items-center justify-center bg-violet-100 border-2 border-white">
                <span className="text-2xl font-bold text-violet-600">
                  {profile.username?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-semibold truncate text-[#0a0e27]">
            {profile.name || profile.username}
          </h2>
          <p className="text-sm mb-1 text-violet-500">@{profile.username}</p>
          {profile.biography && (
            <p className="text-sm leading-relaxed text-slate-500">{profile.biography}</p>
          )}
        </div>
      </div>
    </div>
  );
}
