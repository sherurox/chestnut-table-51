import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../../scripts/encrypt-token.mjs";
import { AdminNotSetUpError, NOT_SET_UP_MESSAGE, WrongPasswordError } from "./adminKey.js";
import { EXPIRED_MESSAGE, getToken, getTokenExpiresOn, isLoggedIn, login, logout } from "./auth.js";
import { loadData } from "./github.js";

const FAKE_TOKEN = "fake-token-for-tests-zyxwvu987654";
const PASSPHRASE = "correct horse battery staple";
const blob = await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Records every storage write so we can prove the token never lands in browser storage.
function recordingStorage() {
  const writes: string[] = [];
  const map = new Map<string, string>();
  return {
    writes,
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes.push(`${k}=${v}`);
        map.set(k, v);
      },
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    },
  };
}

function fakeFetch(opts: { key?: Response; verify?: Response } = {}) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if (u.endsWith("admin-key.json")) return opts.key ?? json(200, blob);
    if (u.endsWith("/repos/sherurox/chestnut-table-51")) return opts.verify ?? json(200, { full_name: "x" });
    throw new Error(`unexpected fetch ${u}`);
  });
}

let local: ReturnType<typeof recordingStorage>;
let session: ReturnType<typeof recordingStorage>;

beforeEach(() => {
  local = recordingStorage();
  session = recordingStorage();
  vi.stubGlobal("localStorage", local.storage);
  vi.stubGlobal("sessionStorage", session.storage);
});

afterEach(() => {
  logout();
  vi.unstubAllGlobals();
});

describe("login", () => {
  it("decrypts, verifies with one authenticated call, and keeps the token in memory only", async () => {
    const fetchFn = fakeFetch();
    await login(PASSPHRASE, fetchFn as typeof fetch);
    expect(isLoggedIn()).toBe(true);
    expect(getToken()).toBe(FAKE_TOKEN);
    expect(getTokenExpiresOn()).toBe("2027-10-01");

    const verifyCalls = fetchFn.mock.calls.filter(([u]) => String(u).includes("api.github.com"));
    expect(verifyCalls).toHaveLength(1);
    expect((verifyCalls[0]![1]!.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_TOKEN}`);

    expect([...local.writes, ...session.writes].join("\n")).not.toContain(FAKE_TOKEN);
  });

  it("logout clears the token", async () => {
    await login(PASSPHRASE, fakeFetch() as typeof fetch);
    logout();
    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBeNull();
  });

  it("a wrong password fails with 'Wrong password' and never calls GitHub", async () => {
    const fetchFn = fakeFetch();
    const err = await login("wrong horse battery staple", fetchFn as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WrongPasswordError);
    expect((err as Error).message).toBe("Wrong password");
    expect(isLoggedIn()).toBe(false);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes("api.github.com"))).toBe(false);
  });

  it("a 401 on verify gives the invalid/expired message, without the token", async () => {
    const err = await login(PASSPHRASE, fakeFetch({ verify: json(401, { message: "Bad credentials" }) }) as typeof fetch).catch(
      (e: unknown) => e,
    );
    expect((err as Error).message).toBe(EXPIRED_MESSAGE);
    expect(String(err)).not.toContain(FAKE_TOKEN);
    expect(isLoggedIn()).toBe(false);
  });

  it.each([403, 404])("a %i on verify says the key can't access the repo", async (status) => {
    await expect(login(PASSPHRASE, fakeFetch({ verify: json(status, {}) }) as typeof fetch)).rejects.toThrow(
      "Admin key doesn't have access to this repo.",
    );
    expect(isLoggedIn()).toBe(false);
  });

  it.each([
    ["missing (404)", new Response("Not found", { status: 404 })],
    ["HTML fallback", new Response("<!doctype html><html></html>", { status: 200 })],
    ["malformed JSON shape", json(200, { v: 1, hello: "world" })],
  ])("admin-key.json %s → 'Admin not set up yet'", async (_label, key) => {
    const err = await login(PASSPHRASE, fakeFetch({ key }) as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminNotSetUpError);
    expect((err as Error).message).toBe(NOT_SET_UP_MESSAGE);
  });
});

describe("reads while logged in (CLAUDE.md §8.1)", () => {
  it("logged out in dev: reads the local dev file, unauthenticated", async () => {
    const fetchFn = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => json(200, { version: 99 }));
    vi.stubGlobal("fetch", fetchFn);
    await loadData().catch(() => undefined);
    expect(String(fetchFn.mock.calls[0]![0])).toContain("__dev-data__");
  });

  it("logged in: always reads the authenticated GitHub contents API, even in dev", async () => {
    await login(PASSPHRASE, fakeFetch() as typeof fetch);
    const fetchFn = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => json(500, {}));
    vi.stubGlobal("fetch", fetchFn);
    await loadData().catch(() => undefined);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("api.github.com/repos/sherurox/chestnut-table-51/contents/data/data.json");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(local.writes.join("\n")).not.toContain(FAKE_TOKEN);
  });
});
