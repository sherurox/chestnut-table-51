#!/usr/bin/env node
// Post-build check (run after `npm run build`, locally and in CI). Fails if:
//  - admin code leaked into the viewer entry chunk (admin routes must be lazy-loaded, CLAUDE.md §8),
//  - there is no separate admin chunk,
//  - the dev-only ?forceConflict=1 hook survived into the production bundle (CLAUDE.md §8.2),
//  - anything token-shaped is in dist/,
//  - the service worker precaches the admin chunk, lacks the admin runtime-cache rule (offline games,
//    CLAUDE.md §8.1), caches api.github.com/data at runtime, or the admin chunk imports a chunk that
//    wouldn't be available offline.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

// Strings that only exist in admin code (auth.ts, adminKey.ts, githubWrite.ts, admin screens).
const ADMIN_MARKERS = [
  "admin-key.json",
  "Wrong password",
  "someone else is editing",
  "Unlocking…",
  "Chip check",
  "Clear stuck game",
  "Add a late player",
];
const DEV_ONLY_MARKERS = ["forceConflict", "ct51-style-preview"];
// Built by concatenation so this file doesn't match the secret scan.
const TOKEN_PATTERNS = [new RegExp("github" + "_pat_[A-Za-z0-9_]{20,}"), new RegExp("gh" + "p_[A-Za-z0-9]{20,}")];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat();
}

const failures = [];
const html = await readFile(join(dist, "index.html"), "utf8");
const entryMatch = /<script[^>]+type="module"[^>]+src="[^"]*?(assets\/[^"]+\.js)"/.exec(html);
if (!entryMatch) {
  console.error("check-bundle: couldn't find the entry script in dist/index.html");
  process.exit(1);
}
const entryPath = join(dist, entryMatch[1]);

const jsFiles = (await listFiles(dist)).filter((f) => f.endsWith(".js"));
let adminChunk = null;
for (const file of jsFiles) {
  const text = await readFile(file, "utf8");
  const name = file.slice(dist.length);
  const isEntry = file === entryPath;
  for (const marker of ADMIN_MARKERS) {
    if (text.includes(marker)) {
      if (isEntry) failures.push(`admin code in the viewer entry chunk ${name}: "${marker}"`);
      else adminChunk = name;
    }
  }
  for (const marker of DEV_ONLY_MARKERS) {
    if (text.includes(marker)) failures.push(`dev-only code in production bundle ${name}: "${marker}"`);
  }
  for (const pattern of TOKEN_PATTERNS) {
    if (pattern.test(text)) failures.push(`token-shaped string in ${name}`);
  }
}
if (!adminChunk) failures.push("no separate admin chunk found (is #/admin/* still lazy-loaded?)");
else {
  const sw = await readFile(join(dist, "sw.js"), "utf8").catch(() => "");
  const chunkFile = adminChunk.split(/[\\/]/).pop();
  if (sw.includes(chunkFile)) failures.push(`service worker precaches the admin chunk ${chunkFile}`);
  if (!sw.includes("AdminRoutes-") || !sw.includes("ct51-admin")) {
    failures.push("service worker has no runtime-cache rule for the admin chunk (offline games need it)");
  }
  if (/api\.github\.com|__dev-data__\/data|data\.json/.test(sw.replace(/denylist:\[[^\]]*\]/g, ""))) {
    failures.push("service worker mentions api.github.com or data: no runtime caching of data allowed");
  }
  // New versions must take over open pages immediately (src/lib/appUpdate.ts relies on controllerchange).
  if (!sw.includes("skipWaiting()") || !sw.includes("clientsClaim()")) {
    failures.push("service worker lacks skipWaiting()/clientsClaim(): updates would wait for every tab to close");
  }
  // Fonts are self-hosted and precached, Latin subset only (no Google Fonts, no unused subsets offline).
  if (!/inter-latin-400-normal[^"]*\.woff2/.test(sw) || !/playfair-display-latin-700-normal[^"]*\.woff2/.test(sw)) {
    failures.push("service worker doesn't precache the self-hosted Inter/Playfair Latin fonts");
  }
  if (/(cyrillic|greek|vietnamese)[^"]*\.woff2/.test(sw)) failures.push("service worker precaches non-Latin font subsets");
  // Every chunk the admin chunk imports must be precached, or the admin can't run offline.
  const adminText = await readFile(join(dist, adminChunk), "utf8");
  for (const [, imported] of adminText.matchAll(/from\s*"\.\/([^"]+\.js)"/g)) {
    if (!sw.includes(`assets/${imported}`)) failures.push(`admin chunk imports ${imported}, which is not precached`);
  }
}

// The entry registers the service worker itself and handles updates (src/lib/appUpdate.ts).
const entryText = await readFile(entryPath, "utf8");
for (const marker of ["controllerchange", "vite:preloadError", "ct51.reloadedForUpdate"]) {
  if (!entryText.includes(marker)) failures.push(`entry chunk lacks update handling ("${marker}")`);
}

if (failures.length > 0) {
  console.error("check-bundle FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`check-bundle OK: entry ${entryMatch[1]} has no admin code; admin chunk ${adminChunk}; no dev-only hooks.`);
