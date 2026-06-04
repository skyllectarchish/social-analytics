import api from "../api/client";

// Lightweight AI-surface event batcher: buffers events and flushes every 5s,
// at 16 events, or on page hide. Disables itself silently if the endpoint
// rejects auth so it can never spam the console.
type Pending = {
  ts: string;
  feature: string;
  action: string;
  ref_id?: string;
  meta?: Record<string, unknown>;
  latency_ms?: number;
};

let buffer: Pending[] = [];
let timer: number | undefined;
let disabled = false;

async function flush() {
  window.clearTimeout(timer);
  timer = undefined;
  if (disabled || buffer.length === 0) return;
  const events = buffer.splice(0, 16);
  try {
    await api.post("/telemetry", { events });
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403 || status === 404) disabled = true;
    // otherwise drop the batch — telemetry is best-effort
  }
}

export function trackAI(
  feature: string,
  action: string,
  opts: { refId?: string; meta?: Record<string, unknown>; latencyMs?: number } = {},
) {
  if (disabled) return;
  buffer.push({
    ts: new Date().toISOString(),
    feature,
    action,
    ...(opts.refId ? { ref_id: opts.refId } : {}),
    ...(opts.meta ? { meta: opts.meta } : {}),
    ...(opts.latencyMs != null ? { latency_ms: Math.round(opts.latencyMs) } : {}),
  });
  if (buffer.length >= 16) void flush();
  else if (timer === undefined) timer = window.setTimeout(() => void flush(), 5000);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    buffer = buffer.slice(0, 16);
    void flush();
  });
}
