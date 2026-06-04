import { tokenStore } from "./client";

// Server-sent-events reader for the AI streaming endpoints. EventSource can't
// set an Authorization header, so we read fetch's body stream and parse the
// frames ourselves. Wire format (backend/app/ai/digest.py):
//   event: token   data: {"text": "...", "seq": N}
//   event: done    data: <full response JSON>
//   event: error   data: {"code": "...", "message": "..."}
export type StreamResult<T> =
  | { kind: "done"; payload: T }
  | { kind: "error"; code: string; message: string };

export async function streamSSE<T>(
  path: string,
  opts: { onToken: (text: string) => void; signal?: AbortSignal },
): Promise<StreamResult<T>> {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` },
    signal: opts.signal,
  });
  if (res.status === 429) return { kind: "error", code: "quota", message: "AI quota exhausted for this month." };
  if (!res.ok || !res.body) return { kind: "error", code: `http_${res.status}`, message: "Stream failed to start." };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (event === "token") {
          try {
            const j = JSON.parse(data) as { text?: string };
            if (j.text) opts.onToken(j.text);
          } catch { /* malformed frame — skip */ }
        } else if (event === "done") {
          try {
            return { kind: "done", payload: JSON.parse(data) as T };
          } catch {
            return { kind: "error", code: "parse", message: "Could not parse the final payload." };
          }
        } else if (event === "error") {
          try {
            const j = JSON.parse(data) as { code?: string; message?: string };
            return { kind: "error", code: j.code ?? "unknown", message: j.message ?? "Stream errored." };
          } catch {
            return { kind: "error", code: "unknown", message: "Stream errored." };
          }
        }
      }
    }
  }
  return { kind: "error", code: "eof", message: "Stream ended without a result." };
}
