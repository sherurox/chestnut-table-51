import { describe, expect, it } from "vitest";
import { seasonGamesInOrder } from "../domain/fun.js";
import { migrate } from "../domain/migrations.js";
import { seasonStandings } from "../domain/standings.js";
import type { Data, Game } from "../domain/types.js";
import seedRaw from "../domain/__fixtures__/seed.json" with { type: "json" };
import { seasonRace } from "./seasonShow.js";
import { shareDate } from "./share.js";

const seed = (): Data => migrate(structuredClone(seedRaw));
const NOW = "2026-10-24T21:00:00.000Z";

// stacks: player → [buy-in, final stack]
function game(id: string, date: string, stacks: Record<string, [number, number]>): Game {
  const players = Object.keys(stacks);
  return {
    id,
    seasonId: "s",
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: stacks[p]![0], at: NOW })),
    cashOuts: players.map((p) => ({ player: p, amount: stacks[p]![1] })),
    createdAt: `${date}T21:00:00.000Z`,
  };
}

function data(games: Game[]): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: [
      { id: "a", name: "Amit", type: "regular", status: "active", createdAt: NOW },
      { id: "b", name: "Bina", type: "regular", status: "active", createdAt: NOW },
      { id: "c", name: "Chetan", type: "regular", status: "active", createdAt: NOW },
      { id: "d", name: "Dev", type: "regular", status: "active", createdAt: NOW },
    ],
    seasons: [{ id: "s", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games,
    liveGame: null,
  };
}

describe("seasonRace", () => {
  it("one frame per season game in seasonGamesInOrder order; nets match standings up to each frame and sum to $0", () => {
    const d = seed();
    for (const seasonId of ["s1", "s2"]) {
      const games = seasonGamesInOrder(d, seasonId);
      const frames = seasonRace(d, seasonId);
      expect(frames.map((f) => f.gameId)).toEqual(games.map((g) => g.id));
      frames.forEach((frame, i) => {
        expect(frame.gameNumber).toBe(i + 1);
        expect(frame.date).toBe(shareDate(games[i]!.date));
        const upTo = seasonStandings({ ...d, games: games.slice(0, i + 1) }, seasonId).filter((r) => r.gamesPlayed > 0);
        expect(frame.rows.map((r) => [r.playerId, r.net, r.rank])).toEqual(upTo.map((r, k) => [r.playerId, r.net, k + 1]));
        expect(frame.rows.reduce((sum, r) => sum + r.net, 0)).toBe(0);
      });
      const final = seasonStandings(d, seasonId).filter((r) => r.gamesPlayed > 0);
      expect(frames.at(-1)!.rows.map((r) => [r.playerId, r.net])).toEqual(final.map((r) => [r.playerId, r.net]));
    }
  });

  it("incognito and deleted games are not frames; no games gives no frames", () => {
    const d = seed();
    const ids = seasonRace(d, "s1").map((f) => f.gameId);
    expect(ids).not.toContain("g9");
    expect(ids).not.toContain("g10");
    expect(seasonRace(data([]), "s")).toEqual([]);
  });

  it("late joiners appear from their first game, marked new; rank changes are places gained", () => {
    const frames = seasonRace(
      data([
        game("g1", "2026-10-02", { a: [1000, 1500], b: [1000, 500] }),
        game("g2", "2026-10-03", { b: [1000, 2000], c: [1000, 0] }),
        game("g3", "2026-10-04", { a: [1000, 1000], c: [1000, 2500], d: [1000, 500] }),
      ]),
      "s",
    );
    expect(frames[0]!.rows.map((r) => r.playerId)).toEqual(["a", "b"]);
    expect(frames[1]!.rows.map((r) => [r.playerId, r.net, r.change])).toEqual([
      ["b", 500, 1],
      ["a", 500, -1],
      ["c", -1000, "new"],
    ]);
    expect(frames[2]!.rows.map((r) => [r.playerId, r.net, r.change])).toEqual([
      ["a", 500, 1],
      ["b", 500, -1],
      ["c", 500, 0],
      ["d", -500, "new"],
    ]);
    expect(frames[0]!.rows.every((r) => r.change === "new")).toBe(true);
  });

  it("captions: lead change first, else the night's winners (ties joined), else all square", () => {
    const frames = seasonRace(
      data([
        game("g1", "2026-10-02", { a: [1000, 1500], b: [1000, 500] }),
        game("g2", "2026-10-03", { a: [1000, 1000], b: [1000, 1000] }),
        game("g3", "2026-10-04", { b: [1000, 2500], c: [1000, 500] }),
        game("g4", "2026-10-05", { a: [1000, 1400], c: [1000, 1400], d: [1000, 200] }),
      ]),
      "s",
    );
    expect(frames.map((f) => f.caption)).toEqual([
      "Amit wins the night +$500", // frame 1 never "takes the lead"
      "All square",
      "Bina takes the lead",
      "Amit & Chetan wins the night +$400", // Bina still leads
    ]);
  });

  it("ties for the night are joined like the Last night card", () => {
    const frames = seasonRace(
      data([
        game("g1", "2026-10-02", { a: [1000, 1500], b: [1000, 500] }),
        game("g2", "2026-10-03", { a: [1000, 1200], c: [1000, 1200], b: [1000, 600] }),
      ]),
      "s",
    );
    expect(frames[1]!.caption).toBe("Amit & Chetan wins the night +$200");
  });
});
