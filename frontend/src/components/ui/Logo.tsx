import { Sparkles } from "lucide-react";

// Instagram-gradient rounded square with a sparkles glyph + wordmark.
export default function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2">
      <span className="bg-ig grid h-7 w-7 place-items-center rounded-lg text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        InfluenceIQ
      </span>
    </a>
  );
}
