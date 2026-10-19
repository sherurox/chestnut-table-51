#!/usr/bin/env node
// Post-build check (run after `npm run build`, locally and in CI). Fails if:
//  - admin code leaked into the viewer entry chunk (admin routes must be lazy-loaded, CLAUDE.md §8),
//  - there is no separate admin chunk,
//  - the dev-only ?forceConflict=1 hook survived into the production bundle (CLAUDE.md §8.2),
//  - anything token-shaped is in dist/.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

// Strings that only exist in admin code (auth.ts, adminKey.ts, githubWrite.ts, admin screens).
const ADMIN_MARKERS = ["admin-key.json", "Wrong password", "someone else is editing", "Unlocking…"];
const DEV_ONLY_MARKERS = ["forceConflict"];
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
}

if (failures.length > 0) {
  console.error("check-bundle FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`check-bundle OK: entry ${entryMatch[1]} has no admin code; admin chunk ${adminChunk}; no dev-only hooks.`);
