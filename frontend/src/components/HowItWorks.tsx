import { ChevronRight } from "lucide-react";
import { Reveal, RevealItem } from "./ui/Reveal";
import { steps } from "../data/mock";

export default function HowItWorks() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="chip">How it works</span>
          <h2 className="mt-4 text-4xl font-semibold md:text-5xl">
            Live in <span className="font-serif italic">three minutes.</span>
          </h2>
        </Reveal>

        <Reveal group className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <RevealItem key={s.n}>
              <div className="card-hairline relative h-full p-6">
                <div className="text-aurora num text-3xl font-semibold">{s.n}</div>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-foreground/65">{s.body}</p>
                {i < steps.length - 1 && (
                  <div className="absolute right-3 top-1/2 hidden md:block">
                    <ChevronRight className="h-5 w-5 text-foreground/30" />
                  </div>
                )}
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
