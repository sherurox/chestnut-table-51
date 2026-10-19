import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Data } from "../domain/types.js";
import { fetchCommitHistory, loadData, setAuthTokenProvider } from "./github.js";

const TOKEN = "fake-token-for-tests-read-path-1";

const sample: Data = {
  version: 1,
  settings: { presetBuyIns: [1000] },
  players: [],
  seasons: [],
  games: [],
  liveGame: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  };
}

beforeEach(() => {
  // Logged in, so loadData skips the dev-only local file and reads GitHub.
  setAuthTokenProvider(() => TOKEN);
});

afterEach(() => {
  setAuthTokenProvider(() => null);
  vi.unstubAllGlobals();
});

describe("loadData and 304s", () => {
  it("a bare 304 reuses our cached copy, without showing an error", async () => {
    const cached = { data: { ...sample, settings: { presetBuyIns: [777] } }, lastUpdated: "2026-10-19T10:00:00Z" };
    vi.stubGlobal("localStorage", memoryStorage({ "ct51.dataCache": JSON.stringify(cached) }));
    const fetchFn = vi.fn(async () => new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchFn);

    const loaded = await loadData();
    expect(loaded).toEqual({ data: cached.data, lastUpdated: cached.lastUpdated, fromCache: true, error: null });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("a bare 304 with no cached copy refetches with no-store", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("/commits")) return json(200, [{ commit: { author: { date: "2026-10-19T11:00:00Z" } } }]);
      return init?.cache === "no-store" ? json(200, sample) : new Response(null, { status: 304 });
    });
    vi.stubGlobal("fetch", fetchFn);

    const loaded = await loadData();
    expect(loaded.data).toEqual(sample);
    expect(loaded.error).toBeNull();
    const contentCalls = fetchFn.mock.calls.filter(([u]) => String(u).includes("/contents/"));
    expect(contentCalls.map(([, init]) => init?.cache)).toEqual(["no-cache", "no-store"]);
  });

  it("never sends conditional headers itself", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const fetchFn = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).includes("/commits") ? json(200, []) : json(200, sample),
    );
    vi.stubGlobal("fetch", fetchFn);
    await loadData();
    for (const [, init] of fetchFn.mock.calls) {
      const names = Object.keys((init?.headers ?? {}) as Record<string, string>).map((h) => h.toLowerCase());
      expect(names).not.toContain("if-none-match");
      expect(names).not.toContain("if-modified-since");
    }
  });
});

describe("fetchCommitHistory and 304s", () => {
  it("a bare 304 refetches with no-store instead of failing", async () => {
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) =>
      init?.cache === "no-store"
        ? json(200, [{ sha: "abc", html_url: "u", commit: { message: "Admin: x", author: { date: "d" } } }])
        : new Response(null, { status: 304 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await expect(fetchCommitHistory()).resolves.toEqual([{ sha: "abc", message: "Admin: x", date: "d", url: "u" }]);
  });
});
