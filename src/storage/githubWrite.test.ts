import { describe, expect, it, vi } from "vitest";
import { addPlayer, type Change } from "../domain/adminOps.js";
import type { Data } from "../domain/types.js";
import { EXPIRED_MESSAGE } from "./auth.js";
import { CONFLICT_MESSAGE, SaveError, saveChange } from "./githubWrite.js";

const TOKEN = "fake-token-for-tests-abcdef123456";
const NOW = "2026-10-19T20:00:00.000Z";

function initialData(): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [{ id: "p1", name: "Alice", type: "regular", status: "active", createdAt: NOW }],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games: [],
    liveGame: null,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface PutBody {
  message: string;
  content: string;
  sha: string;
  branch: string;
}

// A tiny in-memory stand-in for the GitHub contents API: GET returns {sha, base64 content}; PUT
// accepts only the current sha (else 409). `putScript` entries run before the default handling and can
// return a Response to override it.
class FakeGitHub {
  data = initialData();
  sha = "sha-0";
  private shaCounter = 0;
  gets = 0;
  puts: PutBody[] = [];
  putScript: Array<(body: PutBody) => Response | void> = [];

  externalSave(change: Change): void {
    this.data = change(this.data);
    this.sha = `sha-${++this.shaCounter}`;
  }

  fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    if (!init?.method || init.method === "GET") {
      this.gets++;
      return json(200, {
        sha: this.sha,
        encoding: "base64",
        content: Buffer.from(JSON.stringify(this.data)).toString("base64"),
      });
    }
    const body = JSON.parse(String(init.body)) as PutBody;
    this.puts.push(body);
    const scripted = this.putScript.shift()?.(body);
    if (scripted) return scripted;
    if (body.sha !== this.sha) return json(409, { message: `is at ${this.sha} but expected ${body.sha}` });
    this.data = JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) as Data;
    this.sha = `sha-${++this.shaCounter}`;
    return json(200, { commit: { sha: "commit-abc" } });
  });
}

const addAmit = addPlayer({ id: "p2", name: "Amit", type: "regular", now: NOW });
const addBob = addPlayer({ id: "p3", name: "Bob", type: "regular", now: NOW });

async function save(gh: FakeGitHub, change: Change = addAmit) {
  return saveChange(change, "Admin: added player Amit", { fetch: gh.fetch as typeof fetch, token: TOKEN });
}

describe("saveChange", () => {
  it("fetches fresh, applies, validates and PUTs with sha, branch, message and decodable content", async () => {
    const gh = new FakeGitHub();
    const result = await save(gh);
    expect(gh.gets).toBe(1);
    expect(gh.puts).toHaveLength(1);
    expect(gh.puts[0]).toMatchObject({ sha: "sha-0", branch: "main", message: "Admin: added player Amit" });
    expect(gh.data.players.map((p) => p.name)).toEqual(["Alice", "Amit"]);
    expect(result).toEqual({ data: gh.data, commitSha: "commit-abc", unchanged: false });
  });

  it("writes pretty JSON with a trailing newline", async () => {
    const gh = new FakeGitHub();
    await save(gh);
    const text = Buffer.from(gh.puts[0]!.content, "base64").toString("utf8");
    expect(text).toBe(`${JSON.stringify(gh.data, null, 2)}\n`);
  });

  it("on 409: refetches, reapplies the change to the fresh data, and succeeds", async () => {
    const gh = new FakeGitHub();
    gh.putScript.push(() => gh.externalSave(addBob)); // someone else saves between our GET and PUT
    const change = vi.fn(addAmit);
    const result = await save(gh, change);

    expect(gh.puts.map((p) => p.sha)).toEqual(["sha-0", "sha-1"]);
    expect(gh.gets).toBe(2);
    expect(change).toHaveBeenCalledTimes(2);
    expect(change.mock.calls[1]![0].players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(result.data.players.map((p) => p.name)).toEqual(["Alice", "Bob", "Amit"]);
    expect(gh.data).toEqual(result.data);
  });

  it("on 422 with a changed sha: treats it as a conflict and retries", async () => {
    const gh = new FakeGitHub();
    gh.putScript.push(() => {
      gh.externalSave(addBob);
      return json(422, { message: "sha does not match" });
    });
    const result = await save(gh);
    expect(gh.puts).toHaveLength(2);
    expect(result.data.players.map((p) => p.name)).toEqual(["Alice", "Bob", "Amit"]);
  });

  it("on 422 with an unchanged sha: stops and shows GitHub's message, not the conflict message", async () => {
    const gh = new FakeGitHub();
    gh.putScript.push(() => json(422, { message: "Invalid request. content is not valid Base64" }));
    const err = await save(gh).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveError);
    expect((err as Error).message).toBe("Save failed: PUT 422 — Invalid request. content is not valid Base64");
    expect((err as Error).message).not.toContain(CONFLICT_MESSAGE);
    expect(gh.puts).toHaveLength(1);
    expect(gh.data.players).toHaveLength(1);
  });

  it("gives up with the conflict message after 3 retries (4 PUTs)", async () => {
    const gh = new FakeGitHub();
    for (let i = 0; i < 10; i++) gh.putScript.push(() => gh.externalSave((d) => d));
    await expect(save(gh)).rejects.toThrow(CONFLICT_MESSAGE);
    expect(gh.puts).toHaveLength(4);
  });

  it("blocks a change that produces invalid data: no PUT", async () => {
    const gh = new FakeGitHub();
    const duplicateName: Change = (d) => ({
      ...d,
      players: [...d.players, { id: "p9", name: " alice ", type: "regular", status: "active", createdAt: NOW }],
    });
    await expect(save(gh, duplicateName)).rejects.toThrow(/^Save blocked: Duplicate player name/);
    expect(gh.puts).toHaveLength(0);
  });

  it("does not retry when the change itself throws (business rule on fresh data)", async () => {
    const gh = new FakeGitHub();
    gh.externalSave(addPlayer({ id: "p5", name: "Amit", type: "regular", now: NOW }));
    await expect(save(gh)).rejects.toThrow("There's already a player named Amit.");
    expect(gh.gets).toBe(1);
    expect(gh.puts).toHaveLength(0);
  });

  it("refuses to upload when the data on GitHub is invalid", async () => {
    const gh = new FakeGitHub();
    gh.data = { ...gh.data, version: 99 } as unknown as Data;
    await expect(save(gh)).rejects.toThrow(/doesn't pass validation/);
    expect(gh.puts).toHaveLength(0);
  });

  it("the fresh GET is never conditional and never uses the HTTP cache", async () => {
    const gh = new FakeGitHub();
    await save(gh);
    const getInits = gh.fetch.mock.calls.map(([, init]) => init).filter((init) => !init?.method || init.method === "GET");
    expect(getInits).toHaveLength(1);
    for (const init of getInits) {
      expect(init!.cache).toBe("no-store");
      const names = Object.keys(init!.headers as Record<string, string>).map((h) => h.toLowerCase());
      expect(names).not.toContain("if-none-match");
      expect(names).not.toContain("if-modified-since");
      expect((init!.headers as Record<string, string>).Accept).toBe("application/vnd.github+json");
    }
  });

  it("a 304 on the fresh GET fails clearly and sends no PUT", async () => {
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) =>
      !init?.method || init.method === "GET" ? new Response(null, { status: 304 }) : json(200, {}),
    );
    const err = await saveChange(addAmit, "m", { fetch: fetchFn as typeof fetch, token: TOKEN }).catch((e: unknown) => e);
    expect((err as Error).message).toBe("Save failed: GET 304 — no message from GitHub");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("a GET body without sha (e.g. the raw file) fails clearly and sends no PUT", async () => {
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) =>
      !init?.method || init.method === "GET" ? json(200, initialData()) : json(200, {}),
    );
    await expect(saveChange(addAmit, "m", { fetch: fetchFn as typeof fetch, token: TOKEN })).rejects.toThrow(
      "Save failed: GET 200 — response had no file sha/content",
    );
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("reports method, status and GitHub's message, e.g. PUT 403", async () => {
    const gh = new FakeGitHub();
    gh.putScript.push(() => json(403, { message: "Resource not accessible by personal access token" }));
    await expect(save(gh)).rejects.toThrow("Save failed: PUT 403 — Resource not accessible by personal access token");
  });

  it("reports method, status and message for a failing GET, e.g. GET 404", async () => {
    const fetchFn = vi.fn(async () => json(404, { message: "Not Found" }));
    await expect(saveChange(addAmit, "m", { fetch: fetchFn as typeof fetch, token: TOKEN })).rejects.toThrow(
      "Save failed: GET 404 — Not Found",
    );
  });

  it("maps a 401 to the expired-token message", async () => {
    const fetchFn = vi.fn(async () => json(401, { message: "Bad credentials" }));
    await expect(saveChange(addAmit, "m", { fetch: fetchFn as typeof fetch, token: TOKEN })).rejects.toThrow(
      EXPIRED_MESSAGE,
    );
  });

  it("requires a token", async () => {
    await expect(saveChange(addAmit, "m", { fetch: vi.fn() as typeof fetch })).rejects.toThrow(/logged out/);
  });

  it("never puts the token in an error message, even if GitHub echoes it back", async () => {
    const gh = new FakeGitHub();
    gh.putScript.push(() => json(500, { message: `boom ${TOKEN} Authorization: Bearer ${TOKEN}` }));
    const err = await save(gh).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveError);
    expect(String(err)).not.toContain(TOKEN);
    expect((err as Error).message).toContain("[redacted]");
    expect(JSON.stringify(err)).not.toContain(TOKEN);
  });

  it("reports an unreachable GitHub without leaking the token", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError(`Failed to fetch with ${TOKEN}`);
    });
    const err = await saveChange(addAmit, "m", { fetch: fetchFn as typeof fetch, token: TOKEN }).catch((e: unknown) => e);
    expect((err as Error).message).toBe("Couldn't reach GitHub. Nothing was saved.");
    expect(String(err)).not.toContain(TOKEN);
  });

  it("skips the PUT when the change returns the data unchanged", async () => {
    const gh = new FakeGitHub();
    const result = await save(gh, (data) => data);
    expect(result).toMatchObject({ unchanged: true, commitSha: null });
    expect(result.data).toEqual(gh.data);
    expect(gh.puts).toHaveLength(0);
  });
});
