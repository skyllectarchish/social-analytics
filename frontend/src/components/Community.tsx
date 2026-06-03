import { Reveal, RevealItem } from "./ui/Reveal";
import { community } from "../data/mock";

export default function Community() {
  return (
    <section id="community" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="flex items-end justify-between">
            <div>
              <span className="chip">Community</span>
              <h2 className="mt-4 text-4xl font-semibold md:text-5xl">
                Made by creators, <span className="font-serif italic">for creators.</span>
              </h2>
            </div>
            <a className="hidden text-sm text-violet-deep md:inline" href="#">
              Browse all →
            </a>
          </div>
        </Reveal>

        <Reveal group className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {community.map((c) => (
            <RevealItem key={c.handle}>
              <div className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-black/5">
                <img
                  src={c.img}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between text-[10px] text-white">
                  <span className="rounded-full bg-black/40 px-2 py-0.5 backdrop-blur">
                    {c.handle}
                  </span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5 backdrop-blur">
                    {c.rate}%
                  </span>
                </div>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
