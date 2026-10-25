import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { createSandboxStore, ensureSandbox, sandboxMiddleware, sandboxPaths } from "./src/devserver/sandboxServer";

const DEV_DATA_PATH = "/__dev-data__/data.json";
// DEV_HTTP=1: a plain-http dev server on http://localhost:5180 for reviewing in a desktop browser
// (localhost counts as a secure context, so the admin login still works). Never reachable from the LAN.
const DEV_HTTP = process.env.DEV_HTTP === "1";
// SANDBOX=1: dev server only. Data comes from data/sandbox.json and every write goes there through the
// middleware below, never to GitHub; login uses a throwaway key (CLAUDE.md §8.6). Its own ports give it
// its own browser storage, so sandbox games can never sit in a real queue. All ports are strict, so a
// normal dev server can never fall back onto a sandbox port.
const SANDBOX = process.env.SANDBOX === "1";
const HTTPS_PORT = SANDBOX ? 5174 : 5173;
const HTTP_PORT = SANDBOX ? 5181 : 5180;
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

// A plugin hook, so it wins over a `--host` on the command line: DEV_HTTP stays on this computer.
function devHttpServer(): Plugin {
  return {
    name: "ct51-dev-http",
    apply: "serve",
    config: () => ({ server: { host: "localhost", port: HTTP_PORT, strictPort: true } }),
  };
}

function devPorts(): Plugin {
  return {
    name: "ct51-dev-ports",
    apply: "serve",
    config: () => ({ server: { port: HTTPS_PORT, strictPort: true } }),
  };
}

// __CT51_SANDBOX__ is true only when serving with SANDBOX=1, so builds drop every sandbox branch.
function sandboxFlag(): Plugin {
  return {
    name: "ct51-sandbox-flag",
    config: (_config, { command }) => ({ define: { __CT51_SANDBOX__: JSON.stringify(SANDBOX && command === "serve") } }),
  };
}

function sandboxServer(): Plugin {
  return {
    name: "ct51-sandbox",
    apply: "serve",
    async configureServer(server) {
      const paths = sandboxPaths(fileURLToPath(new URL("./data/", import.meta.url)));
      const { seeded, keyCreated } = await ensureSandbox(paths);
      const store = createSandboxStore({
        paths,
        // The app's own migrate + zod schema, so the sandbox never stores a file the app would reject.
        validate: async (raw) => ((await server.ssrLoadModule("/src/domain/migrations.ts")) as typeof import("./src/domain/migrations")).migrate(raw),
        allowPassphrase: DEV_HTTP,
      });
      server.middlewares.use("/__sandbox__", sandboxMiddleware(store));
      server.config.logger.info(
        `\n  SANDBOX mode: data/sandbox.json${seeded ? " (seeded from data/data.json)" : ""}; writes never reach GitHub.` +
          `${keyCreated ? " New test admin key created." : ""} Passphrase: data/sandbox-admin-pass.txt\n`,
      );
    },
  };
}

export default defineConfig({
  base: "/chestnut-table-51/",
  plugins: [
    react(),
    tailwindcss(),
    devDataMiddleware(),
    sandboxFlag(),
    ...(SANDBOX ? [sandboxServer()] : []),
    // Dev server only: a self-signed https certificate, so the admin login (Web Crypto needs a secure
    // context) works when testing on a phone over the LAN. Production builds are unaffected. DEV_HTTP=1 skips it.
    ...(DEV_HTTP ? [devHttpServer()] : [devPorts(), { ...basicSsl(), apply: "serve" as const }]),
    VitePWA({
      registerType: "autoUpdate",
      // Registered by src/lib/appUpdate.ts, which decides whether a new version reloads the page or waits
      // (never mid-game). The plugin's injected registerSW.js would leave pages on the old version.
      injectRegister: false,
      manifest: {
        name: "Chestnut Table 51",
        short_name: "CT51",
        display: "standalone",
        start_url: "/chestnut-table-51/",
        scope: "/chestnut-table-51/",
        background_color: "#0b0405",
        theme_color: "#2a0f14",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Explicit because injectRegister: false otherwise drops them: a new version must take over open
        // pages right away so appUpdate.ts can reload them (or show the banner mid-game).
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Viewers never download admin code (CLAUDE.md §8), not even via the precache.
        globIgnores: ["**/AdminRoutes-*.js"],
        // The admin chunk is cached only once an admin route has loaded it, so the admin can keep running
        // a game offline after a reload. Hashed file names make CacheFirst safe. No other runtime caching:
        // never api.github.com or data (the localStorage cache is the only data cache, §8.1).
        runtimeCaching: [
          {
            urlPattern: /\/assets\/AdminRoutes-[\w-]+\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "ct51-admin",
              expiration: { maxEntries: 3 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        navigateFallbackDenylist: [new RegExp(`^${DEV_DATA_PATH}`)],
      },
    }),
  ],
});
