import { describe, expect, it } from "vitest";
import { seasonCloseBadges } from "./fun.js";
import { migrate } from "./migrations.js";
import { initials, playerTrophies, seasonPodium, type TrophyKind } from "./seasonShow.js";
import { seasonStandings } from "./standings.js";
import type { Data, Game, Season } from "./types.js";
import seedRaw from "./__fixtures__/seed.json" with { type: "json" };

const seed = (): Data => migrate(structuredClone(seedRaw));
const NOW = "2026-10-24T21:00:00.000Z";

// stacks: player → [buy-in, final stack]
function game(id: string, seasonId: string, date: string, stacks: Record<string, [number, number]>): Game {
  const players = Object.keys(stacks);
  return {
    id,
    seasonId,
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: stacks[p]![0], at: NOW })),
    cashOuts: players.map((p) => ({ player: p, amount: stacks[p]![1] })),
    createdAt: `${date}T21:00:00.000Z`,
  };
}

function small(seasons: Season[], games: Game[]): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: ["a", "b", "c", "d"].map((id, i) => ({
      id,
      name: ["Amit Rao", "Bina", "Chetan", "Dev"][i]!,
      type: "regular" as const,
      status: "active" as const,
      createdAt: NOW,
    })),
    seasons,
    games,
    liveGame: null,
  };
}

// The seed with Season 2 closed as well, so two closed seasons hand out trophies.
function twoClosed(): Data {
  const d = seed();
  return { ...d, seasons: d.seasons.map((s) => (s.id === "s2" ? { ...s, status: "closed" as const, endedOn: "2026-07-20" } : s)) };
}

describe("initials", () => {
  it("first letters of the first and last words, one letter for one word", () => {
    expect(initials("Shreyas Khandale")).toBe("SK");
    expect(initials("  amit  kumar rao ")).toBe("AR");
    expect(initials("Rohan")).toBe("R");
    expect(initials("")).toBe("");
  });
});

describe("seasonPodium", () => {
  it("the top 3 of the standings among players with games, final once the season is closed", () => {
    const d = seed();
    for (const seasonId of ["s1", "s2"]) {
      const top = seasonStandings(d, seasonId).filter((r) => r.gamesPlayed > 0).slice(0, 3);
      const podium = seasonPodium(d, seasonId)!;
      expect(podium.final).toBe(seasonId === "s1");
      expect(podium.places.map((p) => [p.place, p.playerId, p.net])).toEqual(top.map((r, i) => [i + 1, r.playerId, r.net]));
      expect(podium.places.every((p) => p.initials === initials(p.name))).toBe(true);
    }
  });

  it("1 or 2 qualifying players give 1 or 2 places; none gives null; regulars with 0 games never place", () => {
    const active: Season = { id: "s", name: "Season 1", status: "active", startedOn: "2026-10-01" };
    expect(seasonPodium(small([active], []), "s")).toBeNull();
    expect(seasonPodium(small([active], []), "missing")).toBeNull();

    const two = small([active], [game("g1", "s", "2026-10-02", { a: [1000, 1500], b: [1000, 500] })]);
    expect(seasonPodium(two, "s")!.places.map((p) => p.playerId)).toEqual(["a", "b"]);

    const one = small([active], [game("g1", "s", "2026-10-02", { a: [1000, 1500], b: [1000, 500] })]);
    one.games[0] = { ...one.games[0]!, status: "deleted" };
    expect(seasonPodium(one, "s")).toBeNull();

    const four = small([active], [game("g1", "s", "2026-10-02", { a: [1000, 1500], b: [1000, 500], c: [1000, 1200], d: [1000, 800] })]);
    const podium = seasonPodium(four, "s")!;
    expect(podium.final).toBe(false);
    expect(podium.places.map((p) => `${p.place}${p.playerId}`)).toEqual(["1a", "2c", "3d"]);
  });
});

describe("playerTrophies", () => {
  // Exactly one trophy per Champion/Podium/Wooden spoon badge, season by season.
  function expectMatchesBadges(d: Data) {
    for (const player of d.players) {
      const trophies = playerTrophies(d, player.id);
      for (const season of d.seasons.filter((s) => s.status === "closed")) {
        const alone = { ...d, games: d.games.filter((g) => g.seasonId === season.id) };
        const kinds = seasonCloseBadges(alone, player.id).map((b) => b.kind);
        const place = seasonStandings(d, season.id)
          .filter((r) => r.gamesPlayed > 0)
          .findIndex((r) => r.playerId === player.id);
        const expected: TrophyKind[] = [];
        if (kinds.includes("podium")) expected.push(kinds.includes("champion") ? "gold" : place === 1 ? "silver" : "bronze");
        if (kinds.includes("woodenSpoon")) expected.push("spoon");
        expect(trophies.filter((t) => t.seasonId === season.id).map((t) => t.kind)).toEqual(expected);
      }
    }
  }

  it("two closed seasons: newest first, one trophy per close badge, with the season's net", () => {
    const d = twoClosed();
    expectMatchesBadges(d);
    const s1 = seasonStandings(d, "s1").filter((r) => r.gamesPlayed > 0);
    const s2 = seasonStandings(d, "s2").filter((r) => r.gamesPlayed > 0);
    const champ = playerTrophies(d, s1[0]!.playerId);
    expect(champ.find((t) => t.seasonId === "s1")).toEqual({ seasonId: "s1", seasonName: "Season 1", kind: "gold", net: s1[0]!.net });
    for (const player of d.players) {
      const ids = playerTrophies(d, player.id).map((t) => t.seasonId);
      expect(ids).toEqual([...ids.filter((id) => id === "s2"), ...ids.filter((id) => id === "s1")]);
    }
    expect(playerTrophies(d, s2[s2.length - 1]!.playerId).at(0)).toMatchObject({ seasonId: "s2", kind: "spoon" });
  });

  it("an active season gives nothing; the seed's closed Season 1 matches its badges", () => {
    const d = seed();
    expectMatchesBadges(d);
    for (const player of d.players) expect(playerTrophies(d, player.id).some((t) => t.seasonId === "s2")).toBe(false);
  });

  it("small seasons: last place holds a medal and the spoon, medal first", () => {
    const closed = (id: string, endedOn: string): Season => ({ id, name: id.toUpperCase(), status: "closed", startedOn: "2026-01-01", endedOn });
    const d = small(
      [closed("x", "2026-02-01"), closed("y", "2026-03-01")],
      [
        game("g1", "x", "2026-01-10", { a: [1000, 1500], b: [1000, 500] }),
        game("g2", "y", "2026-02-10", { a: [1000, 1300], b: [1000, 1000], c: [1000, 700] }),
      ],
    );
    expectMatchesBadges(d);
    expect(playerTrophies(d, "b").map((t) => `${t.seasonId}:${t.kind}`)).toEqual(["y:silver", "x:silver", "x:spoon"]);
    expect(playerTrophies(d, "c").map((t) => `${t.seasonId}:${t.kind}`)).toEqual(["y:bronze", "y:spoon"]);
    expect(playerTrophies(d, "a").map((t) => `${t.seasonId}:${t.kind}`)).toEqual(["y:gold", "x:gold"]);
    expect(playerTrophies(d, "d")).toEqual([]);
  });
});
