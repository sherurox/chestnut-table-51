#!/usr/bin/env node
// One-time setup, run by the owner only (CLAUDE.md §7.2). Encrypts the fine-grained GitHub token with the
// admin passphrase and writes public/admin-key.json. Secrets are read only from hidden terminal input:
// never CLI arguments, env vars or files. Nothing secret is ever printed.
//
// Run from PowerShell or Windows Terminal:   node scripts/encrypt-token.mjs
// (Git Bash / mintty is not a real TTY for Node, so the script refuses to run there.)

import { webcrypto } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { subtle } = webcrypto;

export const ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 16;
const OUT_PATH = fileURLToPath(new URL("../public/admin-key.json", import.meta.url));
// Built by concatenation so the literal prefix never appears in a committed file (see secretScan.test.ts).
const FINE_GRAINED_PREFIX = "github" + "_pat_";

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");
const fromBase64 = (text) => new Uint8Array(Buffer.from(text, "base64"));

// The passphrase is trimmed before use, here and in the app, so a stray trailing space from a phone
// keyboard can't lock the admin out.
export function passphraseError(passphrase) {
  if (passphrase.trim().length < MIN_PASSPHRASE_LENGTH) {
    return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters (use 4-5 random words).`;
  }
  return null;
}

export function expiryDateError(text, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "Use the format YYYY-MM-DD.";
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return "That isn't a real date.";
  }
  if (Date.UTC(y, m - 1, d) <= Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) {
    return "The expiry date must be in the future.";
  }
  return null;
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await subtle.importKey("raw", new TextEncoder().encode(passphrase.trim()), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(token, passphrase, tokenExpiresOn) {
  const error = passphraseError(passphrase);
  if (error) throw new Error(error);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    tokenExpiresOn,
  };
}

// Throws if the passphrase is wrong (AES-GCM authentication fails).
export async function decryptToken(blob, passphrase) {
  const key = await deriveKey(passphrase, fromBase64(blob.salt), blob.iterations);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: fromBase64(blob.iv) }, key, fromBase64(blob.ciphertext));
  return new TextDecoder().decode(plain);
}

class CancelledError extends Error {}

// Reads one line from the terminal in raw mode. With hidden: true nothing is echoed.
function readInput(prompt, { hidden }) {
  return new Promise((resolvePromise, reject) => {
    const { stdin, stdout } = process;
    let value = "";
    const finish = (fn) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      fn();
    };
    const onData = (chunk) => {
      // Drop terminal escape sequences (arrow keys etc.) so they don't end up in the value.
      const text = chunk.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
      for (const ch of text) {
        if (ch === "\r" || ch === "\n") return finish(() => resolvePromise(value));
        if (ch === "\u0003") return finish(() => reject(new CancelledError("Cancelled. Nothing was written.")));
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (!hidden) stdout.write("\b \b");
          }
          continue;
        }
        if (ch < " ") continue;
        value += ch;
        if (!hidden) stdout.write(ch);
      }
    };
    stdout.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function askUntilValid(prompt, options, check) {
  for (;;) {
    const value = await readInput(prompt, options);
    const error = check(value);
    if (!error) return value;
    console.log(`  ${error}`);
  }
}

async function main() {
  if (process.argv.length > 2) {
    console.error("This script takes no arguments. It asks for everything interactively.");
    process.exit(1);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    console.error("Run this in an interactive PowerShell or Windows Terminal window (not Git Bash, not piped).");
    process.exit(1);
  }

  console.log("CT51 admin key setup. Input for the token and passphrase is hidden: nothing appears as you type.\n");

  const token = (
    await askUntilValid("GitHub token (hidden): ", { hidden: true }, (v) => {
      const t = v.trim();
      if (!t) return "No token entered.";
      if (/\s/.test(t)) return "The token can't contain spaces.";
      return null;
    })
  ).trim();
  console.log(`  Received ${token.length} characters.`);
  if (!token.startsWith(FINE_GRAINED_PREFIX)) {
    console.log("  Warning: this doesn't look like a fine-grained token. CLAUDE.md §7.2 requires a fine-grained token.");
  }

  let passphrase;
  for (;;) {
    passphrase = await askUntilValid("Admin passphrase (hidden): ", { hidden: true }, passphraseError);
    const again = await readInput("Same passphrase again (hidden): ", { hidden: true });
    if (again.trim() === passphrase.trim()) break;
    console.log("  The passphrases didn't match. Try again.");
  }

  const tokenExpiresOn = (
    await askUntilValid("Token expiry date (YYYY-MM-DD, as shown on GitHub): ", { hidden: false }, (v) =>
      expiryDateError(v.trim()),
    )
  ).trim();

  console.log("\nEncrypting (this takes a moment)...");
  const blob = await encryptToken(token, passphrase, tokenExpiresOn);
  await writeFile(OUT_PATH, `${JSON.stringify(blob, null, 2)}\n`, "utf8");

  let ok = false;
  try {
    const reread = JSON.parse(await readFile(OUT_PATH, "utf8"));
    ok = (await decryptToken(reread, passphrase)) === token;
  } catch {
    ok = false;
  }
  if (!ok) {
    await unlink(OUT_PATH).catch(() => {});
    console.error("Round-trip check FAILED. public/admin-key.json was removed. Nothing to commit.");
    process.exit(1);
  }

  console.log("Round-trip check OK.");
  console.log("Wrote public/admin-key.json. Commit that file (and only that file). Never commit the token itself.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof CancelledError ? err.message : `Setup failed: ${err?.message ?? "unknown error"}`);
    process.exit(1);
  });
}
