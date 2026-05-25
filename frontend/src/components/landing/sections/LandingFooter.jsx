import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

const COLUMNS = [
  {
    title: "Product",
    links: ["Analytics", "Brand Hub", "AI Insights", "Trending Audio", "Mobile App"],
  },
  {
    title: "Community",
    links: ["Creator Lounge", "Events", "Discord", "Ambassadors", "Newsletter"],
  },
  {
    title: "Resources",
    links: ["Blog", "Playbooks", "Case studies", "Help center", "Status"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Press", "Contact", "Legal"],
  },
];

const InstagramIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>
);
const XIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.244 2H21l-6.55 7.49L22 22h-6.84l-4.78-6.27L4.84 22H2.08l7.02-8.02L2 2h6.94l4.32 5.71L18.244 2Zm-2.4 18h1.92L8.24 4H6.18l9.664 16Z" />
  </svg>
);
const YoutubeIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6Z" />
  </svg>
);
const LinkedinIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05a4.16 4.16 0 0 1 3.74-2c4 0 4.74 2.64 4.74 6.07V21h-4v-5.34c0-1.27-.02-2.9-1.77-2.9-1.77 0-2.04 1.38-2.04 2.81V21h-3.97V9Z" />
  </svg>
);
const GithubIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.52-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.18c0 .31.21.68.79.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
  </svg>
);

const SOCIALS = [
  { Icon: InstagramIcon, label: "Instagram" },
  { Icon: XIcon, label: "X" },
  { Icon: YoutubeIcon, label: "YouTube" },
  { Icon: LinkedinIcon, label: "LinkedIn" },
  { Icon: GithubIcon, label: "GitHub" },
];

export default function LandingFooter() {
  return (
    <footer className="relative pt-12">
      <div className="divider-glow" />
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.4fr,2fr]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_20px_-6px_rgba(167,139,250,0.55)]">
                <Sparkles className="text-[#0a0e27]" size={18} />
              </span>
              <span className="font-display text-lg font-semibold tracking-tight text-[#0a0e27]">
                Lumen<span className="text-gradient-cool">.io</span>
              </span>
            </Link>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-600">
              The creator OS for analytics, AI growth, brand collaborations, and
              community — all engineered for the next decade of social.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {/* Social handles aren't published yet — render as disabled
                  glyphs (not anchors) so clicks don't scroll-to-top and
                  screen readers don't announce them as navigable links. */}
              {SOCIALS.map(({ Icon, label }) => (
                <span
                  key={label}
                  aria-label={label}
                  role="img"
                  className="grid h-10 w-10 place-items-center rounded-full glass text-slate-400"
                >
                  <Icon width={15} height={15} />
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  {col.title}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {/* Marketing footer nav links don't have destinations yet —
                      rendered as styled text rather than href="#" so a click
                      doesn't scroll-to-top and screen readers don't surface
                      them as navigable. */}
                  {col.links.map((l) => (
                    <li key={l}>
                      <span className="text-sm text-slate-600 select-none">
                        {l}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 divider-glow" />
        <div className="mt-6 flex flex-col items-start justify-between gap-4 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Lumen Labs. Crafted for creators.</span>
          <div className="flex items-center gap-5">
            {/* Policy pages aren't authored yet — same treatment as the
                column links above. */}
            <span className="select-none">Privacy</span>
            <span className="select-none">Terms</span>
            <span className="select-none">Cookies</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
