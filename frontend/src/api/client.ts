import axios, { AxiosError } from "axios";

const TOKEN_KEY = "access_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// FastAPI returns `detail` as a string for HTTPExceptions and as an array of
// {type, loc, msg, ...} for 422 validation errors. Flatten to a string.
function normalizeDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (typeof e === "string") return e;
        const loc = Array.isArray(e?.loc)
          ? e.loc.filter((p: unknown) => p !== "body").join(".")
          : "";
        return loc ? `${loc}: ${e?.msg ?? "invalid"}` : e?.msg ?? JSON.stringify(e);
      })
      .join("; ");
  }
  if (typeof detail === "object") {
    const d = detail as { msg?: string };
    return d.msg ?? JSON.stringify(detail);
  }
  return String(detail);
}

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ detail?: unknown }>) => {
    if (err.response?.data && "detail" in err.response.data) {
      (err.response.data as { detail?: unknown }).detail = normalizeDetail(
        err.response.data.detail,
      );
    }
    if (err.response?.status === 401) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith("/login")) {
        const here = window.location.pathname + window.location.search;
        const safeNext = here.startsWith("/") && !here.startsWith("//") ? here : "/";
        const target =
          safeNext === "/" ? "/login" : `/login?next=${encodeURIComponent(safeNext)}`;
        window.location.assign(target);
      }
    }
    return Promise.reject(err);
  },
);

// GET that resolves to null on any error (not-connected 404, empty, network),
// so sub-pages can fall back to mock without a try/catch at every call site.
export async function safeGet<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<T | null> {
  try {
    const { data } = await api.get<T>(url, { params });
    return data;
  } catch {
    return null;
  }
}

// Pull a human-readable message out of an axios error.
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string" && detail) return detail;
    if (err.message) return err.message;
  }
  return fallback;
}

export default api;
