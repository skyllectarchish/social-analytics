// Server-Sent Events helper for AI streaming endpoints. Axios cannot stream
// response bodies, so this uses fetch + ReadableStream + TextDecoder directly.
// Wire-format reference: see tier4-ai-layer-frontend-plan.md §18.

function buildUrl(path, params) {
  const base = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return base;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

// Shared auth-expired path so both the axios response interceptor and this
// stream helper produce identical logout-redirect behavior.
function handleAuthExpired() {
  localStorage.removeItem("access_token");
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

// Parses one buffered SSE block into a { event, data } event. SSE blocks are
// separated by a blank line; lines within a block come in `event: <name>` /
// `data: <payload>` form. We coalesce multiple `data:` lines per spec.
function parseSseBlock(block) {
  let eventName = "message";
  const dataLines = [];
  for (const rawLine of block.split("\n")) {
    if (!rawLine || rawLine.startsWith(":")) continue; // empty or comment (keepalive)
    const sepIdx = rawLine.indexOf(":");
    const field = sepIdx === -1 ? rawLine : rawLine.slice(0, sepIdx);
    const value = sepIdx === -1 ? "" : rawLine.slice(sepIdx + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0 && eventName === "message") return null;
  const raw = dataLines.join("\n");
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw; // tolerate non-JSON payloads
  }
  return { event: eventName, data };
}

// Async iterator over SSE events for a given path. Yields { event, data }.
// On done / error / abort, the iterator returns. Caller should check
// `event.event === "error"` and surface friendly copy.
export async function* openAIStream(path, { params, signal, method = "GET", body } = {}) {
  const url = buildUrl(path, params);
  const token = localStorage.getItem("access_token");
  const headers = {
    Accept: "text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    yield { event: "error", data: { code: "network", message: "Connection failed." } };
    return;
  }

  if (res.status === 401) {
    // Yield an error before redirecting so callers can react in case the
    // navigation is cancelled (e.g. user clicked away before it landed).
    yield { event: "error", data: { code: "unauthorized", message: "Session expired." } };
    handleAuthExpired();
    return;
  }
  if (!res.ok) {
    // Try to surface backend's structured error if present.
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    yield {
      event: "error",
      data: {
        code: payload?.code || mapStatusToCode(res.status),
        message: payload?.detail || payload?.message || res.statusText,
      },
    };
    return;
  }
  if (!res.body) {
    yield { event: "error", data: { code: "unknown", message: "No stream body." } };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (err.name === "AbortError") return;
        yield { event: "error", data: { code: "network", message: "Connection dropped." } };
        return;
      }
      const { value, done } = chunk;
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let sepIdx;
      // Events are terminated by a blank line (\n\n or \r\n\r\n).
      while ((sepIdx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, sepIdx);
        const matchLen = buffer.slice(sepIdx).match(/^\r?\n\r?\n/)[0].length;
        buffer = buffer.slice(sepIdx + matchLen);
        const parsed = parseSseBlock(block);
        if (parsed) yield parsed;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

function mapStatusToCode(status) {
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422) return "not_enough_data";
  if (status === 429) return "quota_exhausted";
  if (status === 502) return "upstream_error";
  if (status === 504) return "upstream_timeout";
  return "unknown";
}
