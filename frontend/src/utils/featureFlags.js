// AI feature flags. Defaults are ON for every Tier 4 surface that has
// shipped through Phase E. The ai_ask (free-form Q&A) flag is held off
// until v2.
//
// Overrides:
//   - VITE_AI_FLAGS_OVERRIDE — comma-separated `name=on|off`, e.g.
//     "ai_caption=off,ai_ask=on". Useful for staging / canary builds.
//   - In future: the response from /api/auth/me can carry a
//     `user.experiments` array. The `userHasFlag()` helper accepts that.

const BASE_FLAGS = {
  ai_digest: true,
  ai_ideas: true,
  ai_diagnostic: true,
  ai_caption: true,
  ai_ask: false,
};

function parseOverride(raw) {
  if (!raw || typeof raw !== "string") return {};
  const out = {};
  for (const piece of raw.split(",")) {
    const [k, v] = piece.split("=").map((s) => s?.trim());
    if (!k) continue;
    if (v === "on" || v === "true" || v === "1") out[k] = true;
    else if (v === "off" || v === "false" || v === "0") out[k] = false;
  }
  return out;
}

const ENV_OVERRIDES = parseOverride(import.meta.env.VITE_AI_FLAGS_OVERRIDE);

export const FLAGS = { ...BASE_FLAGS, ...ENV_OVERRIDES };

export function flagOn(name) {
  return FLAGS[name] === true;
}

/** True if any AI feature is enabled — used to hide the sidebar entry entirely. */
export function anyAIOn() {
  return Object.entries(FLAGS).some(([k, v]) => k.startsWith("ai_") && v === true);
}

/**
 * Combine flag with a per-user override coming back from the auth payload.
 * Backend can send `user.experiments: ["ai_caption"]` to force-enable for
 * specific users. The base flag must be on OR the experiment must opt in.
 */
export function userHasFlag(name, user) {
  if (flagOn(name)) return true;
  const exp = user?.experiments;
  if (Array.isArray(exp) && exp.includes(name)) return true;
  return false;
}
