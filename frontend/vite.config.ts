import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// basicSsl is intentionally not used: ngrok terminates TLS and forwards plain
// HTTP to this dev server. Serving HTTPS locally would mismatch ngrok's
// http:// upstream and surface as ERR_NGROK_3004. If you need local HTTPS
// without a tunnel, re-add `import basicSsl from "@vitejs/plugin-basic-ssl"`
// and put `basicSsl()` back in the plugins array.

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Allow tunneled hosts (ngrok) to reach the dev server. A leading dot
    // matches the domain and all its subdomains, so a fresh ngrok subdomain
    // each session keeps working without re-editing this file.
    allowedHosts: [
      ".ngrok-free.dev",
      ".ngrok-free.app",
      ".ngrok.app",
      ".ngrok.io",
    ],
    proxy: {
      // Proxy API calls to the FastAPI backend so the browser talks same-origin
      // (no CORS) and the OAuth redirect_uri stays on :5173.
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
