import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { flushTelemetry } from "../utils/telemetry";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      // Token was rejected (expired, revoked, server-side invalidation).
      // Clear both the token and any cached user so protected routes don't
      // briefly render against a stale identity.
      localStorage.removeItem("access_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const storeSession = (data) => {
    // Defensive: a malformed login/register response (e.g. backend regression
    // that drops `access_token`) would otherwise put the literal string
    // "undefined" in localStorage, producing `Authorization: Bearer undefined`
    // and a 401-redirect loop.
    if (!data?.access_token) {
      throw new Error("Authentication response missing access_token");
    }
    localStorage.setItem("access_token", data.access_token);
    setUser(data.user ?? null);
  };

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    storeSession(data);
    return data;
  }, []);

  const register = useCallback(async (email, username, password) => {
    const { data } = await api.post("/auth/register", { email, username, password });
    storeSession(data);
    return data;
  }, []);

  const logout = useCallback(() => {
    // Best-effort: drain any buffered telemetry under the soon-to-be-stale
    // token, wipe the cached `/auth/me` (and other authed GETs) from the
    // service worker, then clear state. `caches?.delete` and the flush both
    // succeed silently if unavailable.
    flushTelemetry();
    if (typeof caches !== "undefined") {
      caches.delete("api-cache").catch(() => {});
    }
    localStorage.removeItem("access_token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
