import { ZodError } from "zod";
import { CONFIG } from "../config.js";
import type { Change } from "../domain/adminOps.js";
import { migrate } from "../domain/migrations.js";
import type { Data } from "../domain/types.js";
import { EXPIRED_MESSAGE, getToken } from "./auth.js";
import { authHeaders } from "./github.js";

// Admin write path (CLAUDE.md §8.2). Lives in the lazy admin chunk only. Every write: fetch fresh +
// sha → apply the Change → migrate + validate → PUT. 409 is a conflict; 422 is a conflict only if the
// sha on GitHub has moved since we sent ours, otherwise it's a real error. Conflicts retry up to 3 times.

export const CONFLICT_MESSAGE = "Couldn't save — someone else is editing. Try again.";
const MAX_RETRIES = 3;

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveError";
  }
}

export interface SaveResult {
  data: Data;
  commitSha: string | null;
  // The change made no difference to the fresh data (e.g. the game is already saved), so nothing was
  // committed. This is how the finish commit avoids a duplicate after a save whose response was lost.
  unchanged: boolean;
}

interface Current {
  sha: string;
  data: Data;
}

const contentsUrl = () => `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}`;

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function firstIssue(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "invalid data";
  return err instanceof Error ? err.message : String(err);
}

async function githubMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // non-JSON body
  }
  return "no message from GitHub";
}

// e.g. "Save failed: PUT 403 — Resource not accessible by personal access token". 401 keeps the §7.2 wording.
async function statusError(method: "GET" | "PUT", res: Response): Promise<SaveError> {
  if (res.status === 401) return new SaveError(EXPIRED_MESSAGE);
  return new SaveError(`Save failed: ${method} ${res.status} — ${await githubMessage(res)}`);
}

async function request(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, init);
  } catch {
    throw new SaveError("Couldn't reach GitHub. Nothing was saved.");
  }
}

async function fetchCurrent(fetchFn: typeof fetch, token: string): Promise<Current> {
  // Never conditional, never from the HTTP cache: "no-store" sends no If-None-Match/If-Modified-Since and
  // can't be answered from (or revalidated against) the viewer's raw-read cache entry for this same URL,
  // which would yield a bodyless 304 or the raw file without a sha.
  const res = await request(fetchFn, `${contentsUrl()}?ref=${CONFIG.branch}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (res.status !== 200) throw await statusError("GET", res);
  let body: { sha?: unknown; content?: unknown; encoding?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new SaveError("Save failed: GET 200 — response wasn't JSON");
  }
  if (typeof body.sha !== "string" || typeof body.content !== "string") {
    throw new SaveError("Save failed: GET 200 — response had no file sha/content");
  }
  if (body.encoding !== "base64") {
    throw new SaveError("Save failed: data.json is too large for the GitHub contents API (over 1 MB)");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decodeBase64Utf8(body.content));
  } catch {
    throw new SaveError("The data on GitHub isn't valid JSON. Nothing was saved.");
  }
  try {
    return { sha: body.sha, data: migrate(raw) };
  } catch (err) {
    throw new SaveError(`The data on GitHub doesn't pass validation (${firstIssue(err)}). Nothing was saved.`);
  }
}

// Returns null when the change returns the data object it was given (nothing to write).
function applyChange(change: Change, data: Data): Data | null {
  let next: Data;
  try {
    next = change(data);
  } catch (err) {
    // A business rule failed against the fresh data (e.g. name taken): no point retrying.
    throw new SaveError(firstIssue(err));
  }
  if (next === data) return null;
  try {
    return migrate(next);
  } catch (err) {
    throw new SaveError(`Save blocked: ${firstIssue(err)}`);
  }
}

// Dev-only: `?forceConflict=1` (before or after the #) sends a stale sha on the first PUT so GitHub
// answers 409 and the retry path runs for real. Compiled out of production builds.
function devForceConflict(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return /[?&]forceConflict=1\b/.test(window.location.search + window.location.hash);
}

function redact(err: unknown, token: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  const safe = message.split(token).join("[redacted]");
  return err instanceof SaveError && safe === message ? err : new SaveError(safe);
}

export async function saveChange(
  change: Change,
  message: string,
  deps: { fetch?: typeof fetch; token?: string } = {},
): Promise<SaveResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const token = deps.token ?? getToken();
  if (!token) throw new SaveError("You're logged out. Log in again to save.");

  let forceConflict = import.meta.env.DEV && devForceConflict();
  try {
    let current = await fetchCurrent(fetchFn, token);
    for (let attempt = 0; ; attempt++) {
      const next = applyChange(change, current.data);
      if (next === null) return { data: current.data, commitSha: null, unchanged: true };
      const sentSha = forceConflict ? "0".repeat(40) : current.sha;
      forceConflict = false;

      const res = await request(fetchFn, contentsUrl(), {
        method: "PUT",
        cache: "no-store",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          content: encodeBase64Utf8(`${JSON.stringify(next, null, 2)}\n`),
          sha: sentSha,
          branch: CONFIG.branch,
        }),
      });

      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { commit?: { sha?: unknown } };
        return { data: next, commitSha: typeof body.commit?.sha === "string" ? body.commit.sha : null, unchanged: false };
      }

      if (res.status === 409 || res.status === 422) {
        const ghMessage = await githubMessage(res);
        const fresh = await fetchCurrent(fetchFn, token);
        if (res.status === 422 && fresh.sha === sentSha) {
          throw new SaveError(`Save failed: PUT 422 — ${ghMessage}`);
        }
        if (attempt >= MAX_RETRIES) throw new SaveError(CONFLICT_MESSAGE);
        current = fresh;
        continue;
      }

      throw await statusError("PUT", res);
    }
  } catch (err) {
    throw redact(err, token);
  }
}
