import { CONFIG } from "../config.js";
import { AdminNotSetUpError, decryptAdminKey, parseAdminKey, type AdminKeyBlob } from "./adminKey.js";
import { authHeaders, setAuthTokenProvider } from "./github.js";
import { SANDBOX_ADMIN_KEY_URL } from "./sandbox.js";

// Admin session (CLAUDE.md §7.2). The decrypted token lives only in this module-level variable: never in
// localStorage, sessionStorage, cookies, URLs or logs. Reloading the page logs the admin out.
// Never log request objects or headers, and never put the token in an error message.

export const EXPIRED_MESSAGE = "Admin key is invalid or expired. The owner needs to create a new token.";

let token: string | null = null;
let tokenExpiresOn: string | null = null;
const listeners = new Set<() => void>();

setAuthTokenProvider(() => token);

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToken(): string | null {
  return token;
}

export function isLoggedIn(): boolean {
  return token !== null;
}

export function getTokenExpiresOn(): string | null {
  return tokenExpiresOn;
}

export function logout(): void {
  token = null;
  tokenExpiresOn = null;
  notify();
}

export async function fetchAdminKey(fetchFn: typeof fetch = fetch): Promise<AdminKeyBlob> {
  let res: Response;
  try {
    // Sandbox mode logs in with its own throwaway key (a dummy token); public/admin-key.json isn't used.
    const url = import.meta.env.DEV && __CT51_SANDBOX__ ? SANDBOX_ADMIN_KEY_URL : `${import.meta.env.BASE_URL}admin-key.json`;
    res = await fetchFn(url, { cache: "no-store" });
  } catch {
    throw new Error("Couldn't load the admin key. Check your connection.");
  }
  if (res.status === 404) throw new AdminNotSetUpError();
  if (!res.ok) throw new Error(`Couldn't load the admin key (${res.status}).`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    // e.g. the dev server's SPA fallback serving index.html for a missing file
    throw new AdminNotSetUpError();
  }
  return parseAdminKey(raw);
}

// One authenticated call to prove the token works and can see the repo. GitHub doesn't expose a
// fine-grained token's own write scope, so missing write access only shows up on the first save.
export async function verifyToken(candidate: string, fetchFn: typeof fetch = fetch): Promise<void> {
  let res: Response;
  try {
    res = await fetchFn(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
      headers: authHeaders(candidate),
      cache: "no-store",
    });
  } catch {
    throw new Error("Couldn't reach GitHub to check the admin key.");
  }
  if (res.ok) return;
  if (res.status === 401) throw new Error(EXPIRED_MESSAGE);
  if (res.status === 403 || res.status === 404) throw new Error("Admin key doesn't have access to this repo.");
  throw new Error(`GitHub returned an error (${res.status}) while checking the admin key.`);
}

// Throws AdminNotSetUpError, WrongPasswordError, or an Error with a user-facing message.
export async function login(password: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const blob = await fetchAdminKey(fetchFn);
  const candidate = await decryptAdminKey(blob, password);
  // The sandbox token is a dummy that must never be sent anywhere, so there's nothing to verify.
  if (!(import.meta.env.DEV && __CT51_SANDBOX__)) await verifyToken(candidate, fetchFn);
  token = candidate;
  tokenExpiresOn = blob.tokenExpiresOn;
  notify();
}
