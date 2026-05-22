import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, BookmarkPlus, Check, Sparkles } from "lucide-react";
import AIMarkdown from "./AIMarkdown";
import AIFeedbackButtons from "./AIFeedbackButtons";
import { trackAI } from "../../utils/telemetry";

const FORMAT_TOKENS = {
  REELS:    { label: "REELS",    bg: "rgba(139,92,246,0.10)", color: "#7c3aed", border: "rgba(139,92,246,0.22)" },
  CAROUSEL: { label: "CAROUSEL", bg: "rgba(245,158,11,0.10)", color: "#b45309", border: "rgba(245,158,11,0.22)" },
  IMAGE:    { label: "IMAGE",    bg: "rgba(6,182,212,0.10)",  color: "#0e7490", border: "rgba(6,182,212,0.22)" },
  STORY:    { label: "STORY",    bg: "rgba(236,72,153,0.10)", color: "#be185d", border: "rgba(236,72,153,0.22)" },
};

function copyToClipboard(text) {
  if (typeof navigator === "undefined") return Promise.reject();
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Fallback for older browsers
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export default function IdeaCard({ idea, onCopy, onFeedback, onSaveDraft, index = 0 }) {
  const [copied, setCopied] = useState(false);
  const fmt = FORMAT_TOKENS[idea.suggested_format] || FORMAT_TOKENS.REELS;
  const draftDisabled = !onSaveDraft;

  const handleCopy = async () => {
    const text = `${idea.title}\n\n${idea.body_md}`;
    try {
      await copyToClipboard(text);
      setCopied(true);
      trackAI("ideas", "idea_copied", {
        refId: idea.id,
        meta: { format: idea.suggested_format },
      });
      onCopy?.(idea, text);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silently ignore; user will see no checkmark
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", duration: 0.42, bounce: 0, delay: index * 0.055 }}
      className="rounded-2xl p-4 bg-white flex flex-col gap-3"
      style={{
        border: idea.adjacent ? "1.5px dashed rgba(139,92,246,0.35)" : "1px solid rgba(15,23,42,0.06)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className="inline-flex items-center text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md"
            style={{ background: fmt.bg, color: fmt.color, border: `1px solid ${fmt.border}` }}
          >
            {fmt.label}
          </span>
          {idea.adjacent && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md"
              style={{
                background: "rgba(139,92,246,0.08)",
                color: "#7c3aed",
                border: "1px solid rgba(139,92,246,0.20)",
              }}
            >
              <Sparkles size={9} /> Adjacent theme
            </span>
          )}
        </div>
      </header>

      <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">
        {idea.title}
      </h3>

      {idea.body_md && (
        <div className="text-[12.5px] text-slate-600">
          <AIMarkdown source={idea.body_md} />
        </div>
      )}

      {idea.rationale && (
        <p className="text-[11.5px] text-slate-400 italic leading-relaxed border-l-2 border-slate-100 pl-2">
          {idea.rationale}
        </p>
      )}

      <footer className="mt-auto pt-2 flex items-center gap-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
          style={{
            background: copied ? "rgba(16,185,129,0.10)" : "rgba(15,23,42,0.04)",
            color: copied ? "#10b981" : "#475569",
            border: `1px solid ${copied ? "rgba(16,185,129,0.22)" : "rgba(15,23,42,0.06)"}`,
          }}
          aria-label="Copy idea text"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>

        <button
          type="button"
          disabled={draftDisabled}
          onClick={() => onSaveDraft?.(idea)}
          title={draftDisabled ? "Drafts coming soon" : "Save to drafts"}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
          style={{
            background: "rgba(15,23,42,0.04)",
            color: draftDisabled ? "#cbd5e1" : "#475569",
            border: "1px solid rgba(15,23,42,0.06)",
            cursor: draftDisabled ? "not-allowed" : "pointer",
          }}
          aria-label={draftDisabled ? "Save to drafts (coming soon)" : "Save to drafts"}
        >
          <BookmarkPlus size={11} /> Save
        </button>

        <div className="ml-auto">
          <AIFeedbackButtons
            feature="ideas"
            refId={idea.id}
            promptLabel=""
            align="right"
          />
        </div>
      </footer>
    </motion.article>
  );
}
