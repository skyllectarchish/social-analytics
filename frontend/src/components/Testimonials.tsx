import { Star } from "lucide-react";
import { Reveal, RevealItem } from "./ui/Reveal";
import { avatar, testimonials } from "../data/mock";

export default function Testimonials() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="chip">Loved by 24k+</span>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold md:text-5xl">
            What creators are <span className="text-aurora">saying.</span>
          </h2>
        </Reveal>

        <Reveal group className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((t) => (
            <RevealItem key={t.name}>
              <div className="card-hairline h-full p-5">
                <div className="flex gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                  &quot;{t.quote}&quot;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <img src={avatar(t.img)} className="h-8 w-8 rounded-full" alt="" />
                  <div className="text-xs">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-foreground/55">{t.role}</div>
                  </div>
                </div>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
