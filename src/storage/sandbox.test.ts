import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSandboxStore, ensureSandbox, SANDBOX_DUMMY_TOKEN, sandboxPaths, shaOf, type SandboxPaths, type SandboxStore } from "../devserver/sandboxServer.js";
import { addPlayer } from "../domain/adminOps.js";
import { migrate } from "../domain/migrations.js";
import type { Data } from "../domain/types.js";
import { decryptAdminKey, parseAdminKey } from "./adminKey.js";
import { getToken, login, logout } from "./auth.js";
import { fetchCommitHistory, loadData } from "./github.js";
import { saveChange } from "./githubWrite.js";
import { MemoryStore } from "./__test__/memoryStore.js";
import { SANDBOX_DEVICE_KEY } from "./sandbox.js";
import { SANDBOX_BROWSER_MESSAGE, syncAll } from "./sync.js";

// Sandbox mode (CLAUDE.md §8.6). These run the real dev-server store against a temp copy of the data, with
// __CT51_SANDBOX__ switched on, and prove nothing goes to GitHub and the dummy token is never sent.

const NOW = "2026-10-20T20:00:00.000Z";

const realData: Data = {
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: [{ id: "Am1tAm1t", name: "Amit", type: "regular", status: "active", createdAt: NOW }],
  seasons: [{ id: "S1s1S1s1", name: "Season 1", status: "active", startedOn: "2026-10-15" }],
  games: [],
  liveGame: null,
};
const realText = `${JSON.stringify(realData, null, 2)}\n`;

let dir: string;
let paths: SandboxPaths;
let store: SandboxStore;
let requests: Array<{ url: string; init?: RequestInit }>;

// Routes /__sandbox__/* to the store, like the Vite middleware does; anything else is recorded and fails.
const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  requests.push({ url, init });
  if (!url.startsWith("/__sandbox__/")) throw new TypeError(`unexpected request to ${url}`);
  const result = await store.handle(init?.method ?? "GET", url.slice("/__sandbox__".length), String(init?.body ?? ""));
  return new Response(typeof result.body === "string" ? result.body : JSON.stringify(result.body), { status: result.status });
});

function expectNoGitHubAndNoToken(): void {
  expect(requests.length).toBeGreaterThan(0);
  for (const { url, init } of requests) {
    expect(url).not.toMatch(/github/);
    expect(JSON.stringify(init ?? {})).not.toContain(SANDBOX_DUMMY_TOKEN);
    expect(Object.keys((init?.headers ?? {}) as Record<string, string>).map((h) => h.toLowerCase())).not.toContain("authorization");
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ct51-sandbox-"));
  paths = sandboxPaths(dir);
  await writeFile(paths.source, realText);
  await ensureSandbox(paths);
  store = createSandboxStore({ paths, validate: migrate, allowPassphrase: false, now: () => new Date(NOW) });
  requests = [];
  fetchFn.mockClear();
  vi.stubGlobal("__CT51_SANDBOX__", true);
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("localStorage", new MemoryStore());
}, 30_000);

afterEach(async () => {
  logout();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("sandbox seeding", () => {
  it("copies data.json once, and makes a throwaway key that decrypts to the dummy token", async () => {
    expect(await readFile(paths.data, "utf-8")).toBe(realText);
    const pass = (await readFile(paths.passphrase, "utf-8")).trim();
    expect(pass.length).toBeGreaterThanOrEqual(16);
    const blob = parseAdminKey(JSON.parse(await readFile(paths.adminKey, "utf-8")));
    expect(await decryptAdminKey(blob, pass)).toBe(SANDBOX_DUMMY_TOKEN);
    // Built by concatenation so this file doesn't match the secret scan.
    expect(SANDBOX_DUMMY_TOKEN).not.toMatch(new RegExp("^(github" + "_pat_|gh" + "p_)"));

    // A second start keeps the sandbox as it is (no reseed, same key).
    await writeFile(paths.data, realText.replace("Amit", "Amy"));
    expect(await ensureSandbox(paths)).toEqual({ seeded: false, keyCreated: false });
    expect(await readFile(paths.data, "utf-8")).toContain("Amy");
  });
});

describe("sandbox writes", () => {
  it("saveChange writes data/sandbox.json, never GitHub, never sends the token, and leaves data.json alone", async () => {
    const result = await saveChange(
      addPlayer({ id: "R0hanR0h", name: "Rohan", type: "regular", now: NOW }),
      "Admin: added player Rohan",
      { fetch: fetchFn, token: SANDBOX_DUMMY_TOKEN },
    );
    expect(result.unchanged).toBe(false);
    const written = migrate(JSON.parse(await readFile(paths.data, "utf-8")));
    expect(written.players.map((p) => p.name)).toEqual(["Amit", "Rohan"]);
    expect(result.data).toEqual(written);
    expect(result.commitSha).toBe(shaOf(await readFile(paths.data, "utf-8")));
    expect(await readFile(paths.source, "utf-8")).toBe(realText);
    expect(JSON.parse(await readFile(paths.history, "utf-8"))).toEqual([
      { sha: result.commitSha, message: "Admin: added player Rohan", date: NOW },
    ]);
    expectNoGitHubAndNoToken();
  });

  it("uses the same business rules: a rejected change writes nothing", async () => {
    await expect(
      saveChange(addPlayer({ id: "x1x1x1x1", name: " amit ", type: "regular", now: NOW }), "Admin: added player amit", {
        fetch: fetchFn,
        token: SANDBOX_DUMMY_TOKEN,
      }),
    ).rejects.toThrow(/already a player named Amit/);
    expect(await readFile(paths.data, "utf-8")).toBe(realText);
    expect(requests.filter((r) => r.init?.method === "PUT")).toHaveLength(0);
  });

  it("a stale sha gets 409 and the change is reapplied to the fresh file, like GitHub", async () => {
    let first = true;
    const racing = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (first && init?.method === "PUT") {
        first = false;
        // Someone else saves between our GET and PUT.
        await writeFile(paths.data, `${JSON.stringify({ ...realData, settings: { presetBuyIns: [500] } }, null, 2)}\n`);
      }
      return fetchFn(input, init);
    });
    const result = await saveChange(addPlayer({ id: "R0hanR0h", name: "Rohan", type: "regular", now: NOW }), "Admin: added player Rohan", {
      fetch: racing,
      token: SANDBOX_DUMMY_TOKEN,
    });
    expect(result.data.settings.presetBuyIns).toEqual([500]);
    expect(result.data.players).toHaveLength(2);
    expect(requests.filter((r) => r.init?.method === "PUT")).toHaveLength(2);
    expectNoGitHubAndNoToken();
  });

  it("the server validates too: data that fails the schema is refused with 422 and never written", async () => {
    const current = await readFile(paths.data, "utf-8");
    const bad = { ...realData, seasons: [...realData.seasons, { id: "S2s2S2s2", name: "Season 2", status: "active", startedOn: "2026-10-20" }] };
    const res = await store.handle("PUT", "/data", JSON.stringify({ sha: shaOf(current), content: JSON.stringify(bad), message: "Admin: x" }));
    expect(res.status).toBe(422);
    expect(await readFile(paths.data, "utf-8")).toBe(current);
  });
});

describe("sandbox reads, login and history", () => {
  it("login uses the sandbox key, skips the GitHub verify call, and the token stays in memory", async () => {
    const pass = (await readFile(paths.passphrase, "utf-8")).trim();
    await login(`${pass} `, fetchFn);
    expect(getToken()).toBe(SANDBOX_DUMMY_TOKEN);
    expect(requests.map((r) => r.url)).toEqual(["/__sandbox__/admin-key"]); // not admin-key.json, no verify
    expectNoGitHubAndNoToken();
  }, 30_000);

  it("loadData and the history read the sandbox, even when logged in; history shows first lines only", async () => {
    const pass = (await readFile(paths.passphrase, "utf-8")).trim();
    await login(pass, fetchFn);
    await saveChange(addPlayer({ id: "R0hanR0h", name: "Rohan", type: "regular", now: NOW }), "Admin: added player Rohan\n\nCo-Authored-By: X <y@z>", {
      fetch: fetchFn,
      token: SANDBOX_DUMMY_TOKEN,
    });
    const loaded = await loadData();
    expect(loaded.data.players.map((p) => p.name)).toEqual(["Amit", "Rohan"]);
    expect(loaded.lastUpdated).toBe(NOW);
    expect(await fetchCommitHistory()).toEqual([
      { sha: shaOf(await readFile(paths.data, "utf-8")), message: "Admin: added player Rohan", date: NOW, url: "" },
    ]);
    expectNoGitHubAndNoToken();
  }, 30_000);

  it("serves the test passphrase only where allowed (the localhost review server)", async () => {
    expect((await store.handle("GET", "/test-passphrase", "")).status).toBe(404);
    const review = createSandboxStore({ paths, validate: migrate, allowPassphrase: true });
    const res = await review.handle("GET", "/test-passphrase", "");
    expect(res.status).toBe(200);
    expect(res.body).toBe((await readFile(paths.passphrase, "utf-8")).trim());
  });
});

describe("a normal dev server and a sandbox browser", () => {
  it("refuses to sync this browser's queue to GitHub", async () => {
    vi.stubGlobal("__CT51_SANDBOX__", false);
    const local = new MemoryStore();
    local.setItem(SANDBOX_DEVICE_KEY, "1");
    const save = vi.fn();
    const report = await syncAll({ save, store: local });
    expect(report.error).toBe(SANDBOX_BROWSER_MESSAGE);
    expect(save).not.toHaveBeenCalled();
  });
});
