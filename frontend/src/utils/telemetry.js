// Tiny telemetry batcher. Buffers events client-side, flushes on a 5s timer,
// when the buffer reaches 16, or on `beforeunload` via sendBeacon. The
// backend `/api/telemetry` endpoint is assumed; if it 404s, we silently
// disable for the session to avoid log spam. Event catalog: plan §16.

const ENDPOINT = "/api/telemetry";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER = 16;

let buffer = [];
let timer = null;
let disabled = false;

function pickAuth() {
  try {
    return localStorage.getItem("access_token") || null;
  } catch {
    return null;
  }
}

function schedule() {
  if (timer || disabled || buffer.length === 0) return;
  timer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (disabled || buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const token = pickAuth();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    if (res.status === 404) {
      disabled = true; // backend hasn't shipped this yet — stop trying
    }
  } catch {
    // Network blip — silently drop. We do not retry; telemetry must never
    // affect the user experience.
  }
}

function beaconFlush() {
  if (disabled || buffer.length === 0) return;
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try {
    const blob = new Blob([JSON.stringify({ events: buffer })], {
      type: "application/json",
    });
    navigator.sendBeacon(ENDPOINT, blob);
    buffer = [];
  } catch {
    // ignore
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", beaconFlush);
  window.addEventListener("pagehide", beaconFlush);
}

/**
 * Fire an AI-surface telemetry event. Payload is intentionally small and
 * PII-free — never include caption text, comment text, or user names.
 *
 * @param {string} feature  - "digest" | "ideas" | "diagnostic" | "caption" |
 *                            "quota" | "copilot_nav"
 * @param {string} action   - event name from the catalog (plan §16)
 * @param {object} [opts]
 * @param {string|null} [opts.refId]
 * @param {object} [opts.meta]
 * @param {number} [opts.latency_ms]
 */
export function trackAI(feature, action, opts = {}) {
  if (disabled) return;
  const evt = {
    ts: new Date().toISOString(),
    feature,
    action,
    ref_id: opts.refId ?? null,
    meta: opts.meta,
    latency_ms: opts.latency_ms,
  };
  buffer.push(evt);
  if (buffer.length >= MAX_BUFFER) {
    flush();
  } else {
    schedule();
  }
}

/** Force flush — useful from logout/disclosure-ack/etc. */
export function flushTelemetry() {
  return flush();
}
