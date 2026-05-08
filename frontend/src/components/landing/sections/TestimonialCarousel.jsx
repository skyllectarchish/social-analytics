import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import SectionHeading from "../ui/SectionHeading";

const REVIEWS = [
  {
    name: "Mira Okafor",
    role: "Lifestyle creator · 1.2M",
    avatar: "from-fuchsia-500 to-pink-500",
    quote:
      "Lumen feels like having a strategist, an analyst, and a publicist on call 24/7. My month-over-month reach is up almost 5x.",
    metric: "+412% reach",
    thumb: "from-fuchsia-500 to-pink-500",
  },
  {
    name: "Devin Park",
    role: "Tech reviewer · 480K",
    avatar: "from-cyan-500 to-indigo-500",
    quote:
      "I used to obsess over post timing. Now Lumen tells me the optimal window before I even think about it.",
    metric: "+38% engagement",
    thumb: "from-cyan-500 to-indigo-500",
  },
  {
    name: "Sofia Almeida",
    role: "Travel creator · 870K",
    avatar: "from-violet-500 to-fuchsia-500",
    quote:
      "Three brand collabs in my first week. The match scoring is uncanny — every brief actually fits my niche.",
    metric: "$24k in 30 days",
    thumb: "from-violet-500 to-fuchsia-500",
  },
];

export default function TestimonialCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % REVIEWS.length), 6500);
    return () => clearInterval(id);
  }, []);

  const review = REVIEWS[index];

  const next = () => setIndex((i) => (i + 1) % REVIEWS.length);
  const prev = () => setIndex((i) => (i - 1 + REVIEWS.length) % REVIEWS.length);

  return (
    <section className="relative py-16 sm:py-24">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          eyebrow="Creator stories"
          title={
            <>
              Loved by creators who{" "}
              <span className="text-gradient">treat content like craft</span>
            </>
          }
        />

        <div className="relative mx-auto mt-12 max-w-4xl">
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={review.name}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <GlassCard className="overflow-hidden p-0" tilt={false}>
                  <div className="grid gap-0 md:grid-cols-[1.1fr,1fr]">
                    <div className="relative aspect-[4/3] overflow-hidden md:aspect-auto">
                      <div className={`absolute inset-0 bg-gradient-to-br ${review.thumb}`} />
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                      <button
                        type="button"
                        className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#0a0e27] shadow-[0_18px_36px_-12px_rgba(15,23,42,0.4)] transition hover:scale-110"
                        aria-label="Play story"
                      >
                        <Play size={20} className="ml-0.5" />
                      </button>
                      <div className="absolute left-4 bottom-4 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-[#0a0e27] shadow-[0_8px_18px_-6px_rgba(15,23,42,0.3)]">
                        {review.metric}
                      </div>
                    </div>
                    <div className="flex flex-col justify-between p-7 sm:p-9">
                      <p className="font-display text-lg leading-snug text-[#0a0e27] sm:text-xl">
                        "{review.quote}"
                      </p>
                      <div className="mt-6 flex items-center gap-3">
                        <div
                          className={`grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br ${review.avatar} text-xs font-bold text-white shadow-[0_8px_18px_-6px_rgba(167,139,250,0.45)]`}
                        >
                          {review.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#0a0e27]">
                            {review.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {review.role}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={prev}
              className="grid h-10 w-10 place-items-center rounded-full glass text-slate-700 transition hover:text-[#0a0e27]"
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1.5">
              {REVIEWS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  aria-label={`Go to testimonial ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? "w-8 bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                      : "w-1.5 bg-slate-300"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="grid h-10 w-10 place-items-center rounded-full glass text-slate-700 transition hover:text-[#0a0e27]"
              aria-label="Next testimonial"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
