import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "landing/*"],
      manifest: {
        name: "Keyarc — the guild chest, onchain",
        short_name: "Keyarc",
        description: "A shared chest on Arc for teams that earn together.",
        theme_color: "#1d1a16",
        background_color: "#b9773f",
        display: "standalone",
        start_url: "/app",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: { navigateFallback: "/index.html", globPatterns: ["**/*.{js,css,html,svg,jpg,png,woff2}"], maximumFileSizeToCacheInBytes: 4_000_000 },
    }),
  ],
  server: { port: 5180 },
});
