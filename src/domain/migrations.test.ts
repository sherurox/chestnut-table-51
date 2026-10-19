import { describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import type { Data } from "./types.js";

const initialFile: Data = {
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: [],
  seasons: [],
  games: [],
  liveGame: null,
};

describe("migrate", () => {
  it("returns the initial file shape unchanged and valid", () => {
    expect(migrate(initialFile)).toEqual(initialFile);
  });

  it("is a no-op on already-valid v1 data", () => {
    const data: Data = {
      ...initialFile,
      players: [
        { id: "p1", name: "Alice", type: "regular", status: "active", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    expect(migrate(data)).toEqual(data);
  });

  it("rejects an unknown version", () => {
    const data = { ...initialFile, version: 99 };
    expect(() => migrate(data)).toThrow();
  });
});
