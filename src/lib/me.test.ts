import { describe, expect, it } from "vitest";
import type { Data } from "../domain/types.js";
import { forgetStaleMe, ME_KEY, validMe } from "./me.js";

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, removeItem: (k: string) => void map.delete(k), map };
}

const empty: Data = {
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: [],
  seasons: [],
  games: [],
  liveGame: null,
};

const withPlayers: Data = {
  ...empty,
  players: [
    { id: "Xk3_a9Qz", name: "Real", type: "regular", status: "active", createdAt: "2026-10-20T00:00:00Z" },
    { id: "Mm81-tTe", name: "Gone", type: "regular", status: "archived", createdAt: "2026-10-20T00:00:00Z" },
  ],
};

describe("ct51.me pointing at a missing player", () => {
  it("is no pick once data has loaded, but is kept while data is still loading", () => {
    expect(validMe("p1", empty)).toBeNull();
    expect(validMe("p1", withPlayers)).toBeNull();
    expect(validMe("p1", null)).toBe("p1");
    expect(validMe(null, withPlayers)).toBeNull();
  });

  it("active and archived players are valid picks", () => {
    expect(validMe("Xk3_a9Qz", withPlayers)).toBe("Xk3_a9Qz");
    expect(validMe("Mm81-tTe", withPlayers)).toBe("Mm81-tTe");
  });

  it("a stale pick (test data wiped) is removed from storage", () => {
    const store = memoryStore({ [ME_KEY]: "p1" });
    expect(forgetStaleMe(empty, store)).toBeNull();
    expect(store.map.has(ME_KEY)).toBe(false);
  });

  it("a valid pick, or data not loaded yet, leaves storage alone", () => {
    const store = memoryStore({ [ME_KEY]: "Xk3_a9Qz" });
    expect(forgetStaleMe(withPlayers, store)).toBe("Xk3_a9Qz");
    expect(store.map.get(ME_KEY)).toBe("Xk3_a9Qz");
    const loading = memoryStore({ [ME_KEY]: "p1" });
    expect(forgetStaleMe(null, loading)).toBe("p1");
    expect(loading.map.get(ME_KEY)).toBe("p1");
  });

  it("blocked storage is no pick, not a crash", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(forgetStaleMe(empty, blocked)).toBeNull();
  });
});
