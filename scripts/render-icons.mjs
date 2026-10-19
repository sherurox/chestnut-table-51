#!/usr/bin/env node
// Renders the PWA icons from the brand chip art in src/design/iconSvg.ts, using a locally installed
// Chrome/Chromium in headless mode over the DevTools protocol (no image library, no npm dependency).
// Run from the repo root after changing the icon art, then commit the PNGs:
//   node --experimental-strip-types scripts/render-icons.mjs
// Set CHROME_PATH if Chrome isn't in a standard location.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appIconSvg } from "../src/design/iconSvg.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "public", "icons");
const FONT = join(ROOT, "node_modules", "@fontsource", "playfair-display", "files", "playfair-display-latin-700-normal.woff2");

// maskable/apple-touch are full-bleed squares (the OS applies its own mask); "any" icons keep rounded
// corners on a transparent background.
const ICONS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-512-maskable.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true },
];

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chromePath = CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("render-icons: no Chrome/Chromium found. Set CHROME_PATH.");
  process.exit(1);
}
if (!existsSync(FONT)) {
  console.error("render-icons: Playfair Display isn't installed. Run npm install first.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "ct51-icons-"));
const port = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"]);

try {
  let target;
  for (let i = 0; i < 75 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {
      // not up yet
    }
  }
  if (!target) throw new Error("Chrome didn't start");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Page.enable");
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

  for (const icon of ICONS) {
    const html = `<!doctype html><html><head><style>
      @font-face { font-family: "Playfair Display"; font-weight: 700; src: url("${pathToFileURL(FONT).href}") format("woff2"); }
      html, body { margin: 0; background: transparent; }
      svg { display: block; }
    </style></head><body>${appIconSvg(icon.size, "ic", icon.maskable)}</body></html>`;
    const page = join(profile, "icon.html");
    writeFileSync(page, html);
    await send("Emulation.setDeviceMetricsOverride", { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(page).href });
    await sleep(400);
    const fonts = await send("Runtime.evaluate", {
      expression: `document.fonts.load('700 148px "Playfair Display"').then(() => document.fonts.check('700 148px "Playfair Display"'))`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (fonts.result?.result?.value !== true) throw new Error("Playfair Display didn't load; the icon would use a fallback font");
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 } });
    writeFileSync(join(OUT, icon.file), Buffer.from(shot.result.data, "base64"));
    console.log(`wrote public/icons/${icon.file} (${icon.size}×${icon.size}${icon.maskable ? ", maskable" : ""})`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold files briefly; the OS cleans temp dirs
  }
}
