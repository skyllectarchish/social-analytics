import { brands } from "../data/mock";

export default function LogoStrip() {
  return (
    <div className="border-y border-black/5 bg-white/50 py-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 text-xs font-medium tracking-[0.2em] text-foreground/40">
        <span className="text-[10px] uppercase">Featured in workflows at</span>
        {brands.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
    </div>
  );
}
