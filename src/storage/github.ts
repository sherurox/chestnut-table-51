import { migrate } from "../domain/migrations.js";
import type { Data } from "../domain/types.js";
import { CONFIG, HISTORY_SINCE } from "../config.js";
import { sandboxGetData, sandboxHistory } from "./sandbox.js";

const DEV_DATA_URL = "/__dev-data__/data.json";
const CACHE_KEY = "ct51.dataCache";

export interface LoadedData {
  data: Data;
  lastUpdated: string | null;
  fromCache: boolean;
  error: string | null;
}

export interface CommitEntry {
  sha: string;
  message: string;
  date: string;
  url: string;
}

interface CacheEntry {
  data: Data;
  lastUpdated: string | null;
}

// The admin token is owned by auth.ts (lazy admin chunk). It registers a provider here so viewer code
// can make authenticated reads without importing admin code or holding its own copy of the token.
let authTokenProvider: () => string | null = () => null;

export function setAuthTokenProvider(provider: () => string | null): void {
  authTokenProvider = provider;
}

export function authHeaders(authToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function readHeaders(accept?: string): Record<string, string> {
  // The sandbox token is a dummy: never send it anywhere (CLAUDE.md §8.6).
  const token = import.meta.env.DEV && __CT51_SANDBOX__ ? null : authTokenProvider();
  const headers: Record<string, string> = token ? authHeaders(token) : {};
  if (accept) headers.Accept = accept;
  return headers;
}

// Revalidating read ("no-cache": a 304 costs no rate limit). If a bare 304 ever surfaces, refetch once
// with "no-store" rather than treating it as an error.
async function fetchRevalidated(url: string): Promise<Response> {
  const res = await fetch(url, { headers: readHeaders(), cache: "no-cache" });
  if (res.status !== 304) return res;
  return fetch(url, { headers: readHeaders(), cache: "no-store" });
}

// After a successful admin save, show and cache exactly what was written (no extra read needed).
export function rememberSavedData(data: Data): LoadedData {
  const lastUpdated = new Date().toISOString();
  writeCache({ data, lastUpdated });
  return { data, lastUpdated, fromCache: false, error: null };
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // storage full or unavailable (e.g. private browsing) — cache is best-effort
  }
}

function cachedFallback(error: string): LoadedData {
  const cached = readCache();
  if (!cached) {
    throw new Error(error);
  }
  return { data: cached.data, lastUpdated: cached.lastUpdated, fromCache: true, error };
}

async function fetchLastUpdated(): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/commits?path=${CONFIG.dataPath}&per_page=1`;
    const res = await fetchRevalidated(url);
    if (!res.ok) return null;
    const commits = (await res.json()) as Array<{ commit?: { author?: { date?: string } } }>;
    return commits[0]?.commit?.author?.date ?? null;
  } catch {
    return null;
  }
}

// Sandbox mode (dev server with SANDBOX=1): data/sandbox.json, logged in or not. "Last updated" is the
// newest sandbox save.
async function loadSandboxData(): Promise<LoadedData> {
  try {
    const file = await sandboxGetData(fetch);
    const data = migrate(JSON.parse(file.content));
    const latest = await sandboxHistory(fetch).catch(() => []);
    const loaded = { data, lastUpdated: latest[0]?.date ?? null, fromCache: false, error: null };
    writeCache({ data, lastUpdated: loaded.lastUpdated });
    return loaded;
  } catch (err) {
    return cachedFallback(err instanceof Error ? err.message : String(err));
  }
}

export async function loadData(): Promise<LoadedData> {
  if (import.meta.env.DEV && __CT51_SANDBOX__) return loadSandboxData();
  // The local dev file is for logged-out viewing only: a logged-in admin always reads GitHub, which is
  // where saves go (CLAUDE.md §8.1).
  if (import.meta.env.DEV && !authTokenProvider()) {
    try {
      const res = await fetch(DEV_DATA_URL);
      if (!res.ok) throw new Error(`Dev data endpoint returned ${res.status}`);
      const data = migrate(await res.json());
      return { data, lastUpdated: "just now (dev)", fromCache: false, error: null };
    } catch (err) {
      return cachedFallback(err instanceof Error ? err.message : String(err));
    }
  }

  const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}?ref=${CONFIG.branch}`;

  let res: Response;
  try {
    // "no-cache" revalidates with the ETag instead of trusting GitHub's max-age=60, so a refresh right
    // after a save shows it; a 304 doesn't count against the rate limit.
    res = await fetch(url, { headers: readHeaders("application/vnd.github.raw+json"), cache: "no-cache" });
  } catch {
    return cachedFallback("Couldn't reach GitHub. Showing the last saved copy.");
  }

  // We never send conditional headers ourselves, and the browser normally turns its own revalidation 304
  // into the cached 200. If a bare 304 ever reaches us anyway, it means "unchanged": reuse our copy.
  if (res.status === 304) {
    const cached = readCache();
    if (cached) return { data: cached.data, lastUpdated: cached.lastUpdated, fromCache: true, error: null };
    try {
      res = await fetch(url, { headers: readHeaders("application/vnd.github.raw+json"), cache: "no-store" });
    } catch {
      return cachedFallback("Couldn't reach GitHub. Showing the last saved copy.");
    }
  }
  if (res.status === 401) {
    return cachedFallback("Admin key is invalid or expired. The owner needs to create a new token.");
  }
  if (res.status === 403) {
    return cachedFallback("GitHub is busy. Try refreshing in a few minutes.");
  }
  if (!res.ok) {
    return cachedFallback(`GitHub returned an error (${res.status}).`);
  }

  let data: Data;
  try {
    data = migrate(await res.json());
  } catch {
    return cachedFallback("The saved data didn't pass validation. Showing the last good copy.");
  }

  const lastUpdated = await fetchLastUpdated();
  writeCache({ data, lastUpdated });
  return { data, lastUpdated, fromCache: false, error: null };
}

// The History screen shows only a commit's first line: never its body or trailers like "Co-Authored-By".
export function commitTitle(message: string): string {
  return message.split(/\r?\n/, 1)[0]!.trim();
}

export async function fetchCommitHistory(limit = 50): Promise<CommitEntry[]> {
  if (import.meta.env.DEV && __CT51_SANDBOX__) {
    const commits = await sandboxHistory(fetch);
    return commits.slice(0, limit).map((c) => ({ sha: c.sha, message: commitTitle(c.message), date: c.date, url: "" }));
  }
  const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/commits?path=${CONFIG.dataPath}&since=${encodeURIComponent(HISTORY_SINCE)}&per_page=${limit}`;
  const res = await fetchRevalidated(url);
  if (!res.ok) {
    throw new Error(`Couldn't load edit history (${res.status}).`);
  }
  const commits = (await res.json()) as Array<{
    sha: string;
    html_url: string;
    commit?: { message?: string; author?: { date?: string } };
  }>;
  return commits.map((c) => ({
    sha: c.sha,
    message: commitTitle(c.commit?.message ?? ""),
    date: c.commit?.author?.date ?? "",
    url: c.html_url,
  }));
}
