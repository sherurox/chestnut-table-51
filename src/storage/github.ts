import { migrate } from "../domain/migrations.js";
import type { Data } from "../domain/types.js";
import { CONFIG } from "../config.js";

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
    const res = await fetch(url);
    if (!res.ok) return null;
    const commits = (await res.json()) as Array<{ commit?: { author?: { date?: string } } }>;
    return commits[0]?.commit?.author?.date ?? null;
  } catch {
    return null;
  }
}

export async function loadData(): Promise<LoadedData> {
  if (import.meta.env.DEV) {
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
    res = await fetch(url, { headers: { Accept: "application/vnd.github.raw+json" } });
  } catch {
    return cachedFallback("Couldn't reach GitHub. Showing the last saved copy.");
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

export async function fetchCommitHistory(limit = 50): Promise<CommitEntry[]> {
  const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/commits?path=${CONFIG.dataPath}&per_page=${limit}`;
  const res = await fetch(url);
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
    message: c.commit?.message ?? "",
    date: c.commit?.author?.date ?? "",
    url: c.html_url,
  }));
}
