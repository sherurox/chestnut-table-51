import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const DEV_DATA_PATH = "/__dev-data__/data.json";
const dataFilePath = fileURLToPath(new URL("./data/data.json", import.meta.url));

function devDataMiddleware(): Plugin {
  return {
    name: "ct51-dev-data",
    configureServer(server) {
      server.middlewares.use(DEV_DATA_PATH, async (_req, res) => {
        try {
          const contents = await readFile(dataFilePath, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(contents);
        } catch (err) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: "/chestnut-table-51/",
  plugins: [
    react(),
    tailwindcss(),
    devDataMiddleware(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Chestnut Table 51",
        short_name: "CT51",
        display: "standalone",
        start_url: "/chestnut-table-51/",
        scope: "/chestnut-table-51/",
        background_color: "#0b1f17",
        theme_color: "#15372b",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallbackDenylist: [new RegExp(`^${DEV_DATA_PATH}`)],
      },
    }),
  ],
});
