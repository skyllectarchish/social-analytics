import AIMarkdown from "./AIMarkdown";

// Streaming text container with a blinking caret while tokens arrive.
// Falls back to plain rendering when `renderer="plain"`. Always wraps in
// aria-live="polite" so screen readers announce new chunks without
// re-reading the whole region (see plan §22).
export default function AIStreamSurface({
  text = "",
  isStreaming = false,
  renderer = "markdown",
  minHeight,
  className = "",
}) {
  const showShimmer = isStreaming && text.length === 0;

  if (showShimmer) {
    return (
      <div
        className={`ai-stream ${className}`}
        aria-live="polite"
        aria-atomic="false"
        aria-busy="true"
        style={{ minHeight: minHeight ?? 80 }}
      >
        <div className="space-y-2">
          <div className="h-3 rounded-md ai-shimmer w-3/4" />
          <div className="h-3 rounded-md ai-shimmer w-5/6" />
          <div className="h-3 rounded-md ai-shimmer w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`ai-stream ${className}`}
      aria-live="polite"
      aria-atomic="false"
      aria-busy={isStreaming || undefined}
      style={minHeight ? { minHeight } : undefined}
    >
      {renderer === "markdown" ? (
        <AIMarkdown source={text} />
      ) : (
        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
          {text}
        </p>
      )}
      {isStreaming && <span className="ai-caret" aria-hidden="true">▍</span>}
    </div>
  );
}
