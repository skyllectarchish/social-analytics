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
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
