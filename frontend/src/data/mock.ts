// Hardcoded mock data mirroring the InfluenceIQ reference site.

export const PALETTE = {
  primary: "#7c3aed",
  violet: "#8b5cf6",
  purple: "#c084fc",
  pink: "#ec4899",
  orange: "#f97316",
  blue: "#60a5fa",
  ink: "#0a0e27",
  muted: "#6b7280",
  grid: "rgba(15,17,40,0.06)",
};

export const avatar = (n: number) => `https://i.pravatar.cc/80?img=${n}`;
export const heroAvatars = [5, 12, 32, 15, 47];

// ---------- Hero dashboard preview ----------
export const dashMetrics = [
  { label: "Followers", value: "184.3K", delta: "+3.4%" },
  { label: "Engagement", value: "6.42%", delta: "+0.82%" },
  { label: "Reach", value: "2.84M", delta: "+12.1%" },
  { label: "Impressions", value: "5.21M", delta: "+8.7%" },
];

export const dashSidebar = [
  "Overview",
  "Content Lab",
  "Reels Studio",
  "Audience DNA",
  "Competitors",
  "AI Copilot",
];

export const dashArea = [
  { d: "W1", v: 150 },
  { d: "W2", v: 158 },
  { d: "W3", v: 154 },
  { d: "W4", v: 167 },
  { d: "W5", v: 172 },
  { d: "W6", v: 169 },
  { d: "W7", v: 179 },
  { d: "W8", v: 184 },
];

// ---------- Featured brands ----------
export const brands = [
  "GLOSSIER",
  "RHODE",
  "AESOP",
  "ARC'TERYX",
  "NOTION",
  "FIGMA",
  "LINEAR",
  "STRIPE",
];

// ---------- Features ----------
export const features = [
  {
    icon: "UsersRound",
    title: "Audience DNA",
    body: "Cluster your followers by sentiment, geography, loyalty and brand safety in a single map.",
  },
  {
    icon: "Zap",
    title: "Algorithm Score",
    body: "A live 0–100 score that explains exactly why a post is or isn't being pushed.",
  },
  {
    icon: "Heart",
    title: "Best-Time Heatmap",
    body: "See the 12 windows each week your audience is most likely to engage.",
  },
  {
    icon: "Play",
    title: "Reels Studio",
    body: "Watch-rate, retention curves, hook analysis and trending audio matched to your style.",
  },
  {
    icon: "BarChart3",
    title: "Competitor Radar",
    body: "Track up to 20 accounts side-by-side with growth, mix and engagement deltas.",
  },
  {
    icon: "Bot",
    title: "AI Copilot",
    body: "Ask anything about your account. Get markdown answers, drafts and shot lists in seconds.",
  },
] as const;

// ---------- Charts / preview ----------
export const storyArea = Array.from({ length: 30 }, (_, i) => {
  const base = 150 + i * 1.2;
  const wob = Math.sin(i / 2.3) * 6 + ((i * 17) % 11) - 4;
  const spike = i === 21 ? 14 : i === 22 ? 18 : 0;
  return { d: i + 1, v: Math.round(base + wob + spike) };
});
export const storyPoints = [
  "Annotated spikes for every viral moment",
  "Compare cohorts across any timeframe",
  "Export as a beautiful PDF for clients",
];

// ---------- Community ----------
const COMMUNITY_RATES = [
  "4.9", "1.4", "4.1", "4.1", "1.6", "3.6", "10.0", "6.1", "5.1", "2.6", "1.4", "1.6",
];
export const community = COMMUNITY_RATES.map((rate, i) => ({
  handle: `@creator${i + 1}`,
  rate,
  img: `https://picsum.photos/seed/com${i}/300/300`,
}));

// ---------- Trending audio ----------
// deterministic hill-shaped waveform (20 bars, 0..1)
function waveform(peak: number, shift: number) {
  return Array.from({ length: 20 }, (_, i) => {
    const t = (i + shift) % 20;
    const h = 1 - Math.abs(t - 10) / 11;
    return Math.max(0.05, Math.min(1, h * peak + 0.05));
  });
}
export const trendingAudio = [
  { title: "midnight in tokyo — lofi.k", reels: "412K", delta: "+18%", bars: waveform(0.85, 0) },
  { title: "soft launch — vela", reels: "284K", delta: "+12%", bars: waveform(1, 4) },
  { title: "golden hour — mei. mei", reels: "192K", delta: "+24%", bars: waveform(0.9, 8) },
];

// ---------- How it works ----------
export const steps = [
  { n: "01", title: "Connect Instagram", body: "One click, no scraping. We use the official Graph API." },
  { n: "02", title: "We crunch 6 months", body: "Your last 1,000 posts are scored by our algorithm engine." },
  { n: "03", title: "Get your playbook", body: "A 7-day plan with formats, captions and posting windows." },
];

// ---------- Pricing ----------
export const pricing = [
  {
    name: "Starter",
    price: "0",
    cadence: "free forever",
    features: ["1 account", "30-day analytics", "Weekly digest", "Community access"],
    cta: "Start free",
    popular: false,
  },
  {
    name: "Creator",
    price: "29",
    cadence: "per month",
    features: [
      "3 accounts",
      "Unlimited history",
      "AI Copilot · 500 prompts",
      "Reels Studio",
      "Competitor Radar · 5",
    ],
    cta: "Start 14-day trial",
    popular: true,
  },
  {
    name: "Studio",
    price: "99",
    cadence: "per month",
    features: [
      "15 accounts",
      "Team seats · 5",
      "AI Copilot · unlimited",
      "White-label reports",
      "Priority support",
    ],
    cta: "Talk to sales",
    popular: false,
  },
];

// ---------- Testimonials ----------
export const testimonials = [
  {
    quote: "InfluenceIQ finally made my analytics feel human. The AI suggestions feel like a creative director on retainer.",
    name: "Lena Park",
    role: "Creator · 412k",
    img: 5,
  },
  {
    quote: "We replaced three tools with InfluenceIQ. The audience DNA module is in a league of its own.",
    name: "Daniel Ortega",
    role: "Brand · Mercer&Co",
    img: 12,
  },
  {
    quote: "The best-time heatmap alone added 38% to my reach in six weeks.",
    name: "Aisha Rahman",
    role: "Creator · 184k",
    img: 32,
  },
  {
    quote: "Reporting clients used to dread now feels like a story. Beautiful product.",
    name: "Jules Vautier",
    role: "Agency · Atelier",
    img: 15,
  },
];

// ---------- Footer ----------
export const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#" },
      { label: "Pricing", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Roadmap", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "#" },
      { label: "Docs", href: "#" },
      { label: "Help center", href: "#" },
      { label: "API", href: "#" },
    ],
  },
];
