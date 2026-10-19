import { describe, expect, it } from "vitest";
import type { Data, Game } from "../domain/types.js";
import { shareDate, shareText } from "./share.js";

const NOW = "2026-10-24T21:00:00.000Z";

function game(id: string, mode: Game["mode"], date: string, stacks: Record<string, [number, number]>): Game {
  const players = Object.keys(stacks);
  return {
    id,
    seasonId: "s1",
    date,
    mode,
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: stacks[p]![0], at: NOW })),
    cashOuts: players.map((p) => ({ player: p, amount: stacks[p]![1] })),
    createdAt: NOW,
  };
}

const data: Data = {
  version: 1,
  settings: { presetBuyIns: [1000] },
  players: [
    { id: "s", name: "Shreyas", type: "regular", status: "active", createdAt: NOW },
    { id: "r", name: "Rohan", type: "regular", status: "active", createdAt: NOW },
    { id: "a", name: "Amit", type: "regular", status: "active", createdAt: NOW },
  ],
  seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
  games: [
    game("old", "season", "2026-10-20", { s: [1000, 3350], r: [1000, 0], a: [1000, 650] }),
    game("new", "season", "2026-10-24", { s: [1000, 2100], r: [1000, 900], a: [1000, 0] }),
  ],
  liveGame: null,
};

describe("shareText", () => {
  it("formats the §9.8 group-chat text for a season game", () => {
    expect(shareText(data, data.games[1]!)).toBe(
      "CT51 · Season 1 · Sat 24 Oct\nShreyas +$1,100 · Rohan −$100 · Amit −$1,000\nSeason leader: Shreyas +$3,450",
    );
  });

  it("labels incognito games and leaves out the season leader", () => {
    const incog = game("i", "incognito", "2026-10-23", { r: [1500, 2000], a: [1000, 500] });
    expect(shareText({ ...data, games: [...data.games, incog] }, incog)).toBe(
      "CT51 · Incognito · Fri 23 Oct\nRohan +$500 · Amit −$500",
    );
  });

  it("reads the date as a calendar date", () => {
    expect(shareDate("2026-01-01")).toBe("Thu 1 Jan");
  });
});
