import type { ReactNode } from "react";

// Minimal, safe markdown renderer for AI output: headings, bullet lists,
// **bold**, *italic*, `code`. No raw HTML ever reaches the DOM.
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${keyBase}b${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={`${keyBase}c${i++}`} className="rounded bg-black/5 px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={`${keyBase}i${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function AIMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(<ul key={key} className="my-1.5 list-disc space-y-1 pl-5">{list}</ul>);
      list = [];
    }
  };

  text.split("\n").forEach((line, n) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(<li key={`l${n}`}>{inline(trimmed.replace(/^[-*]\s+/, ""), `l${n}`)}</li>);
      return;
    }
    flushList(`ul${n}`);
    if (!trimmed) return;
    const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push(
        <p key={`h${n}`} className={`font-semibold ${h[1].length === 1 ? "text-base" : "text-sm"} mt-2`}>
          {inline(h[2], `h${n}`)}
        </p>,
      );
      return;
    }
    blocks.push(<p key={`p${n}`} className="my-1">{inline(trimmed, `p${n}`)}</p>);
  });
  flushList("ulend");

  return <div className={`text-sm leading-relaxed text-foreground/80 ${className}`}>{blocks}</div>;
}
