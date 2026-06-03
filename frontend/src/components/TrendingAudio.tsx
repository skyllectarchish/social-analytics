import { Music } from "lucide-react";
import { Reveal, RevealItem } from "./ui/Reveal";
import { trendingAudio } from "../data/mock";

export default function TrendingAudio() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="chip">
            <Music className="h-3.5 w-3.5" /> Reels Studio
          </span>
          <h2 className="mt-4 text-4xl font-semibold md:text-5xl">
            Trending audio, <span className="text-aurora">matched to you.</span>
          </h2>
        </Reveal>

        <Reveal group className="mt-10 grid gap-4 md:grid-cols-3">
          {trendingAudio.map((t) => (
            <RevealItem key={t.title}>
              <div className="card-hairline p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-ig grid h-10 w-10 place-items-center rounded-xl text-white">
                      <Music className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold leading-tight">{t.title}</div>
                      <div className="text-xs text-foreground/55">{t.reels} reels</div>
                    </div>
                  </div>
                  <span className="chip !bg-mint/50 !text-emerald-700">{t.delta}</span>
                </div>

                <div className="mt-4 flex h-14 items-end gap-1">
                  {t.bars.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{
                        height: `${(h * 100).toFixed(1)}%`,
                        background: `linear-gradient(180deg, #ec4899 ${Math.round(100 - h * 64)}%, #8b5cf6)`,
                      }}
                    />
                  ))}
                </div>

                <button className="mt-4 w-full rounded-full bg-ink py-2 text-xs font-medium text-white">
                  Use this audio
                </button>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
