import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// FastAPI returns `detail` as a string for raised HTTPExceptions and as an
// array of `{type, loc, msg, input, ctx}` objects for 422 validation errors.
// Callers (and JSX) expect a string, so flatten before rejecting.
function normalizeDetail(detail) {
  if (typeof detail === "string" || detail == null) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (typeof e === "string") return e;
        const loc = Array.isArray(e?.loc) ? e.loc.filter((p) => p !== "body").join(".") : "";
        return loc ? `${loc}: ${e?.msg ?? "invalid"}` : e?.msg ?? JSON.stringify(e);
      })
      .join("; ");
  }
  if (typeof detail === "object") return detail.msg ?? JSON.stringify(detail);
  return String(detail);
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.data && "detail" in err.response.data) {
      err.response.data.detail = normalizeDetail(err.response.data.detail);
    }
    if (err.response?.status === 401) {
      localStorage.removeItem("access_token");
      // Don't bounce if we're already on /login — otherwise a 401 from any API
      // call made while sitting on the login page (e.g. a stray telemetry POST
      // before login completes) would full-page-reload us in a tight loop.
      if (!window.location.pathname.startsWith("/login")) {
        // Preserve the page the user was on so login can send them back.
        // Validate the path-only `next` value (must start with `/` but not
        // `//`) so a stray query-param injection can't open-redirect to a
        // different origin.
        const here = window.location.pathname + window.location.search;
        const safeNext =
          here.startsWith("/") && !here.startsWith("//") ? here : "/";
        const target = safeNext === "/" ? "/login" : `/login?next=${encodeURIComponent(safeNext)}`;
        window.location.assign(target);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
