import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useNavigate } from "react-router-dom";

// Sanitization allow-list — defense-in-depth even though the backend should
// be filtering. LLM output is non-deterministic so we treat every rendered
// markdown source as untrusted. Reference: plan §17.
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    "p", "br", "strong", "em", "code", "pre",
    "ul", "ol", "li", "blockquote",
    "h1", "h2", "h3", "h4",
    "a", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
    "del", "span",
  ],
  attributes: {
    "*": ["className"],
    a: ["href", "title", "dataRoute", "dataQuery"],
    code: ["className"],
    pre: ["className"],
    span: ["className"], // style stripped — see plan §17 (we don't pass through inline color)
    th: ["align"],
    td: ["align"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "route"],
  },
};

function AIAnchor({ href, children, ...rest }) {
  const navigate = useNavigate();

  if (typeof href === "string" && href.startsWith("route:")) {
    const route = href.slice("route:".length);
    return (
      <button
        type="button"
        onClick={() => navigate(route)}
        className="text-violet-600 underline underline-offset-2 hover:text-violet-700"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
      >
        {children}
      </button>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="text-violet-600 underline underline-offset-2 hover:text-violet-700"
      {...rest}
    >
      {children}
    </a>
  );
}

// Tailwind-styled tags that match the dashboard's light theme. Headings stay
// modest because AI markdown lives inside cards, not as page headers.
const COMPONENTS = {
  a: AIAnchor,
  p: ({ children, ...p }) => (
    <p className="text-[13.5px] leading-relaxed text-slate-700 mb-3 last:mb-0" {...p}>
      {children}
    </p>
  ),
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-800">{children}</em>,
  h1: ({ children }) => <h1 className="text-base font-semibold text-slate-900 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[15px] font-semibold text-slate-900 mb-2 mt-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[13.5px] font-semibold text-slate-900 mb-1.5 mt-3 uppercase tracking-wide">{children}</h3>,
  h4: ({ children }) => <h4 className="text-[12.5px] font-semibold text-slate-700 mb-1 mt-2">{children}</h4>,
  ul: ({ children }) => <ul className="list-disc list-outside pl-5 text-[13.5px] text-slate-700 space-y-1 mb-3">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside pl-5 text-[13.5px] text-slate-700 space-y-1 mb-3">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-violet-200 pl-3 text-[13px] text-slate-600 italic my-3">
      {children}
    </blockquote>
  ),
  code: ({ inline, className, children, ...p }) => {
    if (inline) {
      return (
        <code
          className="px-1 py-0.5 rounded text-[12px] font-mono text-violet-700"
          style={{ background: "rgba(139,92,246,0.10)" }}
          {...p}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`block ${className ?? ""}`} {...p}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      className="rounded-lg p-3 text-[12px] font-mono overflow-x-auto my-3"
      style={{ background: "rgba(15,23,42,0.04)", color: "#0f172a" }}
    >
      {children}
    </pre>
  ),
  hr: () => <hr className="my-4 border-slate-100" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-[12.5px] text-slate-700 border-collapse">{children}</table>
    </div>
  ),
  th: ({ children, ...p }) => (
    <th className="text-left font-semibold text-slate-600 px-2 py-1 border-b border-slate-200" {...p}>
      {children}
    </th>
  ),
  td: ({ children, ...p }) => (
    <td className="px-2 py-1 border-b border-slate-100" {...p}>
      {children}
    </td>
  ),
};

export default function AIMarkdown({ source = "", className = "" }) {
  if (!source) return null;
  return (
    <div className={`ai-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]}
        components={COMPONENTS}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
