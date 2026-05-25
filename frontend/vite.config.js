import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        // Keep manifest copy aligned with the HTML <title> and LandingPage's
        // useEffect document.title override — three drifted names was hurting
        // SEO + PWA install affordance consistency.
        name: "Lumen — Instagram Analytics",
        short_name: "Lumen",
        description: "Where influencers & brands grow together — Instagram analytics built for creators.",
        theme_color: "#fafafb",
        background_color: "#fafafb",
        display: "standalone",
        start_url: "/",
        icons: [
          // Vector icon works for installability requirements in every modern
          // PWA-supporting browser; the PNG fallbacks referenced previously
          // didn't exist in public/ and broke install prompts.
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Cache GET responses for read-only insight endpoints only.
            // Anything that touches auth state (/auth/*) must skip the cache
            // or a stale 200 could leak the previous user's data to a fresh
            // browser session on the same device.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/api/auth/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 300, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Explicit allow-list instead of `true` so dev servers exposed on a LAN
    // / tunnel can't be hit via DNS rebinding to exfiltrate /api responses.
    // Add additional hostnames here (e.g. ngrok URL) as needed.
    allowedHosts: ["localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
