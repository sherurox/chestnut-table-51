import { describe, expect, it } from "vitest";
import { addBuyIn, startGame, type FinishedEntry, type LocalGame } from "../domain/liveGame.js";
import type { Data } from "../domain/types.js";
import {
  clearLocalGame,
  loadLocalGame,
  loadQueue,
  moveToQueue,
  reconcileLocal,
  removeFromQueue,
  saveLocalGame,
  StorageUnavailableError,
} from "./localGame.js";
import { MemoryStore } from "./__test__/memoryStore.js";
import { LIVE_GAME_KEY, SYNC_QUEUE_KEY } from "./localKeys.js";

const NOW = "2026-10-24T21:04:00.000Z";

const data: Data = {
  version: 1,
  settings: { presetBuyIns: [1000] },
  players: [
    { id: "a", name: "Amit", type: "regular", status: "active", createdAt: NOW },
    { id: "s", name: "Shreyas", type: "regular", status: "active", createdAt: NOW },
  ],
  seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
  games: [],
  liveGame: null,
};

function game(id = "G1"): LocalGame {
  return startGame(data, { id, playerIds: ["a", "s"], mode: "season", guestChoice: null, date: "2026-10-24", now: NOW });
}

function entry(id: string): FinishedEntry {
  return {
    game: {
      id,
      seasonId: "s1",
      date: "2026-10-24",
      mode: "season",
      status: "finished",
      players: ["a", "s"],
      buyIns: [],
      cashOuts: [],
      createdAt: NOW,
    },
    promote: [],
  };
}

describe("live game autosave", () => {
  it("restores exactly what was saved (reload / app close)", () => {
    const store = new MemoryStore();
    const g = addBuyIn(game(), "a", 1500, NOW);
    saveLocalGame(g, store);
    expect(loadLocalGame(store)).toEqual(g);
    clearLocalGame(store);
    expect(loadLocalGame(store)).toBeNull();
  });

  it("sets an unreadable game aside instead of deleting it", () => {
    const store = new MemoryStore();
    store.setItem(LIVE_GAME_KEY, "{not json");
    expect(loadLocalGame(store)).toBeNull();
    expect(store.getItem(`${LIVE_GAME_KEY}.corrupt`)).toBe("{not json");
    expect(store.getItem(LIVE_GAME_KEY)).toBeNull();
  });

  it("refuses to pretend it saved when storage is unavailable", () => {
    expect(() => saveLocalGame(game(), null)).toThrow(StorageUnavailableError);
  });
});

describe("sync queue", () => {
  it("moveToQueue queues the finished game, then clears the live game", () => {
    const store = new MemoryStore();
    saveLocalGame(game("G1"), store);
    moveToQueue(entry("G1"), store);
    expect(loadQueue(store).map((e) => e.game.id)).toEqual(["G1"]);
    expect(loadLocalGame(store)).toBeNull();
  });

  it("never duplicates a game in the queue, and keeps order", () => {
    const store = new MemoryStore();
    moveToQueue(entry("G1"), store);
    moveToQueue(entry("G2"), store);
    moveToQueue(entry("G1"), store);
    expect(loadQueue(store).map((e) => e.game.id)).toEqual(["G2", "G1"]);
    removeFromQueue("G2", store);
    expect(loadQueue(store).map((e) => e.game.id)).toEqual(["G1"]);
    removeFromQueue("G1", store);
    expect(store.getItem(SYNC_QUEUE_KEY)).toBeNull();
  });

  it("reconcileLocal drops a live copy whose game is already queued (crash between the two writes)", () => {
    const store = new MemoryStore();
    store.setItem(SYNC_QUEUE_KEY, JSON.stringify([entry("G1")]));
    saveLocalGame(game("G1"), store);
    reconcileLocal(store);
    expect(loadLocalGame(store)).toBeNull();
    expect(loadQueue(store)).toHaveLength(1);
  });

  it("sets an unreadable queue aside", () => {
    const store = new MemoryStore();
    store.setItem(SYNC_QUEUE_KEY, "[{\"oops\":1}]");
    expect(loadQueue(store)).toEqual([]);
    expect(store.getItem(`${SYNC_QUEUE_KEY}.corrupt`)).toBe("[{\"oops\":1}]");
  });
});
