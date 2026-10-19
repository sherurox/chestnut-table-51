import { describe, expect, it, vi } from "vitest";
import type { Change } from "../domain/adminOps.js";
import { addBuyIn, finishLocalGame, setFinalStack, startGame, type FinishedEntry } from "../domain/liveGame.js";
import type { Data } from "../domain/types.js";
import { saveChange } from "./githubWrite.js";
import { loadLocalGame, loadQueue, moveToQueue, saveLocalGame } from "./localGame.js";
import { MemoryStore } from "./__test__/memoryStore.js";
import { syncAll } from "./sync.js";

const TOKEN = "fake-token-for-tests-abcdef123456";
const NOW = "2026-10-24T21:04:00.000Z";

function initialData(): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: [
      { id: "a", name: "Amit", type: "regular", status: "active", createdAt: NOW },
      { id: "r", name: "Rohan", type: "guest", status: "active", createdAt: NOW },
    ],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games: [],
    liveGame: null,
  };
}

// Minimal GitHub contents API. `offline` makes every request fail; `loseNextPutResponse` applies the
// next PUT on the "server" but fails the request on the client (the response never arrives).
class FakeGitHub {
  data = initialData();
  sha = 0;
  puts: string[] = [];
  offline = false;
  loseNextPutResponse = false;

  fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError("Failed to fetch");
    if (!init?.method || init.method === "GET") {
      return new Response(
        JSON.stringify({ sha: `sha-${this.sha}`, encoding: "base64", content: Buffer.from(JSON.stringify(this.data)).toString("base64") }),
        { status: 200 },
      );
    }
    const body = JSON.parse(String(init.body)) as { message: string; content: string; sha: string };
    if (body.sha !== `sha-${this.sha}`) return new Response(JSON.stringify({ message: "conflict" }), { status: 409 });
    this.puts.push(body.message);
    this.data = JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) as Data;
    this.sha++;
    if (this.loseNextPutResponse) {
      this.loseNextPutResponse = false;
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify({ commit: { sha: "c" } }), { status: 200 });
  });

  save = (change: Change, message: string) => saveChange(change, message, { fetch: this.fetch as typeof fetch, token: TOKEN });
}

function finishedEntry(id = "G1", guestChoice: "promote" | null = null): FinishedEntry {
  let g = startGame(initialData(), {
    id,
    playerIds: ["a", "r"],
    mode: guestChoice ? "season" : "incognito",
    guestChoice,
    date: "2026-10-24",
    now: NOW,
  });
  g = addBuyIn(addBuyIn(g, "a", 1000, NOW), "r", 1000, NOW);
  g = setFinalStack(setFinalStack(g, "a", "1500"), "r", "500");
  return finishLocalGame(g, (p) => p);
}

describe("syncAll", () => {
  it("keeps the game queued while offline, then saves it in one commit once back online", async () => {
    const gh = new FakeGitHub();
    const store = new MemoryStore();
    moveToQueue(finishedEntry("G1", "promote"), store);

    gh.offline = true;
    const offline = await syncAll({ save: gh.save, data: gh.data, store });
    expect(offline.error).toMatch(/Couldn't reach GitHub/);
    expect(loadQueue(store)).toHaveLength(1);

    gh.offline = false;
    const online = await syncAll({ save: gh.save, data: gh.data, store });
    expect(online).toMatchObject({ error: null, remaining: 0 });
    expect(online.synced[0]?.alreadySaved).toBe(false);
    expect(gh.puts).toEqual(["Admin: finished game 2026-10-24 (Season 1, 2 players; promoted guest Rohan)"]);
    expect(gh.data.games.map((g) => g.id)).toEqual(["G1"]);
    expect(gh.data.players.find((p) => p.id === "r")?.type).toBe("regular");
    expect(loadQueue(store)).toEqual([]);
  });

  it("no duplicate commit when a retry follows a save whose response was lost", async () => {
    const gh = new FakeGitHub();
    const store = new MemoryStore();
    moveToQueue(finishedEntry("G1"), store);

    gh.loseNextPutResponse = true;
    const first = await syncAll({ save: gh.save, data: gh.data, store });
    expect(first.error).not.toBeNull();
    expect(loadQueue(store)).toHaveLength(1); // the phone doesn't know it worked: never drop it

    const retry = await syncAll({ save: gh.save, data: gh.data, store });
    expect(retry.error).toBeNull();
    expect(retry.synced[0]?.alreadySaved).toBe(true);
    expect(gh.puts).toHaveLength(1);
    expect(gh.data.games).toHaveLength(1);
    expect(loadQueue(store)).toEqual([]);
  });

  it("runs only one sync at a time", async () => {
    const gh = new FakeGitHub();
    const store = new MemoryStore();
    moveToQueue(finishedEntry("G1"), store);
    const [a, b] = await Promise.all([
      syncAll({ save: gh.save, data: gh.data, store }),
      syncAll({ save: gh.save, data: gh.data, store }),
    ]);
    expect(a).toBe(b);
    expect(gh.puts).toHaveLength(1);
  });

  it("stops at the first failure and keeps the rest queued in order", async () => {
    const gh = new FakeGitHub();
    const store = new MemoryStore();
    moveToQueue(finishedEntry("G1"), store);
    moveToQueue(finishedEntry("G2"), store);
    const save = vi.fn(gh.save).mockRejectedValueOnce(new Error("GitHub is down"));
    const report = await syncAll({ save, data: gh.data, store });
    expect(report).toMatchObject({ error: "GitHub is down", remaining: 2 });
    expect(loadQueue(store).map((e) => e.game.id)).toEqual(["G1", "G2"]);
  });

  it("retries a live marker that failed at start, and marks it synced", async () => {
    const gh = new FakeGitHub();
    const store = new MemoryStore();
    const local = startGame(initialData(), { id: "L1", playerIds: ["a", "r"], mode: "incognito", guestChoice: null, date: "2026-10-24", now: NOW });
    saveLocalGame(local, store);

    const report = await syncAll({ save: gh.save, data: gh.data, store });
    expect(report.error).toBeNull();
    expect(gh.puts).toEqual(["Admin: started live game"]);
    expect(gh.data.liveGame).toEqual({ gameId: "L1", startedAt: NOW });
    expect(loadLocalGame(store)?.markerSynced).toBe(true);

    await syncAll({ save: gh.save, data: gh.data, store });
    expect(gh.puts).toHaveLength(1); // already synced: nothing more to write
  });
});
