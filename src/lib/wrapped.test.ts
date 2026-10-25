import { describe, expect, it } from "vitest";
import { bestAndWorstGames } from "../domain/charts.js";
import { badgesInGame, nemesis, playerMoods, playerSeasonStats, seasonCloseBadges, seasonGamesInOrder } from "../domain/fun.js";
import { migrate } from "../domain/migrations.js";
import { playerTrophies } from "../domain/seasonShow.js";
import { seasonStandings } from "../domain/standings.js";
import type { Data, Game, Season } from "../domain/types.js";
import seedRaw from "../domain/__fixtures__/seed.json" with { type: "json" };
import { SITUATION_NAMES, TIER_NAMES } from "./funLabels.js";
import { seasonRace } from "./seasonShow.js";
import { ordinal, wrappedModel, wrappedPlayers, wrappedSeasons, type WrappedSlide, type WrappedSlideKind } from "./wrapped.js";

const seed = (): Data => migrate(structuredClone(seedRaw));
const NOW = "2026-10-24T21:00:00.000Z";

// The seed with Season 2 closed as well.
function twoClosed(): Data {
  const d = seed();
  return { ...d, seasons: d.seasons.map((s) => (s.id === "s2" ? { ...s, status: "closed" as const, endedOn: "2026-07-20" } : s)) };
}

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

const closed = (id: string, name: string, startedOn: string, endedOn: string): Season => ({ id, name, status: "closed", startedOn, endedOn });

function small(seasons: Season[], games: Game[]): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: ["a", "b", "c", "d", "e"].map((id, i) => ({
      id,
      name: ["Amit Rao", "Bina", "Chetan", "Dev", "Esha"][i]!,
      type: "regular" as const,
      status: "active" as const,
      createdAt: NOW,
    })),
    seasons,
    games,
    liveGame: null,
  };
}

function slide<K extends WrappedSlideKind>(slides: WrappedSlide[], kind: K): Extract<WrappedSlide, { kind: K }> | undefined {
  return slides.find((s): s is Extract<WrappedSlide, { kind: K }> => s.kind === kind);
}

const kinds = (slides: WrappedSlide[]) => slides.map((s) => s.kind);

describe("ordinal", () => {
  it("adds st/nd/rd/th, with 11–13 as th", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});

describe("wrappedModel numbers equal the existing helpers", () => {
  for (const seasonId of ["s1", "s2"]) {
    it(`every player of the closed ${seasonId}`, () => {
      const data = twoClosed();
      const season = data.seasons.find((s) => s.id === seasonId)!;
      const rows = seasonStandings(data, seasonId).filter((r) => r.gamesPlayed > 0);
      const frames = seasonRace(data, seasonId);
      const moods = playerMoods(data, seasonId);
      expect(wrappedPlayers(data, seasonId)).toEqual(rows);

      rows.forEach((row, i) => {
        const id = row.playerId;
        const model = wrappedModel(data, seasonId, id)!;
        const stats = playerSeasonStats(data, seasonId, id);
        const { best, worst } = bestAndWorstGames(data, seasonId, id);
        const s = model.slides;

        expect(slide(s, "intro")).toMatchObject({
          heading: `${row.name}, your ${season.name} wrapped.`,
          games: stats.games,
          players: rows.length,
          startedOn: season.startedOn,
          endedOn: season.endedOn,
        });
        expect(slide(s, "finish")).toEqual({
          kind: "finish",
          place: i + 1,
          of: rows.length,
          placeLabel: `${ordinal(i + 1)} of ${rows.length}`,
          net: row.net,
          trophies: playerTrophies(data, id).filter((t) => t.seasonId === seasonId),
        });

        const bestNight = slide(s, "bestNight")!;
        expect(bestNight).toMatchObject({ gameId: stats.bestNight!.gameId, date: stats.bestNight!.date, result: stats.bestNight!.result });
        expect(bestNight).toMatchObject({ gameId: best!.gameId, result: best!.result });
        expect(bestNight.badges.map((b) => b.kind)).toEqual(
          badgesInGame(data, best!.gameId).filter((b) => b.playerId === id).map((b) => b.kind),
        );

        const top = slide(s, "top")!;
        expect(top.ledAfter).toBe(frames.filter((f) => f.rows[0]?.playerId === id).length);
        expect(top.seasonGames).toBe(seasonGamesInOrder(data, seasonId).length);

        const tough = slide(s, "toughNight");
        if (worst!.result < 0) {
          expect(tough).toMatchObject({ gameId: worst!.gameId, result: stats.worstNight!.result, totalRebuys: stats.totalRebuys });
        } else {
          expect(tough).toBeUndefined();
        }

        const foe = nemesis(data, seasonId, id);
        expect(slide(s, "nemesis")).toEqual(foe ? { kind: "nemesis", ...foe } : undefined);

        const perGame = seasonGamesInOrder(data, seasonId).flatMap((g) => badgesInGame(data, g.id).filter((b) => b.playerId === id));
        const close = seasonCloseBadges({ ...data, seasons: [season] }, id);
        const expectedKinds = [...new Set([...perGame.map((b) => b.kind), ...close.map((b) => b.kind)])];
        const mood = moods.find((m) => m.playerId === id)!;
        const badges = slide(s, "badges")!;
        expect(badges.badges.map((b) => b.kind)).toEqual(expectedKinds);
        expect(badges.title).toBe(mood.situation ? SITUATION_NAMES[mood.situation] : TIER_NAMES[mood.tier]);

        expect(slide(s, "finale")).toMatchObject({ place: i + 1, of: rows.length, net: row.net, bestNight: { result: best!.result } });
        expect(s[0]!.kind).toBe("intro");
        expect(s[s.length - 1]!.kind).toBe("finale");
      });
    });
  }

  it("season net winnings in Wrapped add up to $0", () => {
    const data = seed();
    const sum = wrappedPlayers(data, "s1").reduce((t, r) => t + slide(wrappedModel(data, "s1", r.playerId)!.slides, "finish")!.net, 0);
    expect(sum).toBe(0);
  });
});

describe("wrappedModel returns null", () => {
  it("for an active season, a player with 0 games, or an unknown season", () => {
    const data = seed();
    expect(wrappedModel(data, "s2", "p1")).toBeNull(); // active
    expect(wrappedPlayers(data, "s2")).toEqual([]);
    expect(wrappedModel(twoClosed(), "s2", "p5")).toBeNull(); // Erin didn't play Season 2
    expect(wrappedModel(data, "s1", "p6")).toBeNull(); // guest, incognito only
    expect(wrappedModel(data, "nope", "p1")).toBeNull();
  });
});

describe("wrappedSeasons", () => {
  it("lists the closed seasons a player played in, newest first", () => {
    expect(wrappedSeasons(twoClosed(), "p1").map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(wrappedSeasons(twoClosed(), "p5").map((s) => s.id)).toEqual(["s1"]);
    expect(wrappedSeasons(seed(), "p6")).toEqual([]);
  });
});

describe("slides are skipped when there is nothing true to say", () => {
  // One game, five players: Dev is 4th of 5, down $100 (no podium, no spoon, no badge).
  const data = small(
    [closed("s", "Season 1", "2026-10-01", "2026-10-02")],
    [game("g1", "s", "2026-10-01", { a: [1000, 1300], b: [1000, 1200], c: [1000, 1100], d: [1000, 900], e: [1000, 500] })],
  );

  it("never down: no tough night", () => {
    const s = wrappedModel(data, "s", "a")!.slides;
    expect(kinds(s)).toEqual(["intro", "finish", "bestNight", "top", "badges", "finale"]);
    expect(slide(s, "top")!.line).toBe("You led after 1 of 1 games");
  });

  it("no nemesis, no badges: the badges slide shows the title only, the best night is the least bad", () => {
    const s = wrappedModel(data, "s", "d")!.slides;
    expect(kinds(s)).toEqual(["intro", "finish", "bestNight", "top", "toughNight", "badges", "finale"]);
    expect(slide(s, "bestNight")).toMatchObject({ heading: "Your least bad night", result: -100, badges: [] });
    expect(slide(s, "badges")).toEqual({ kind: "badges", badges: [], title: "Fresh blood" });
    expect(slide(s, "finale")!.highlight).toBe("Fresh blood");
    expect(slide(s, "finish")!.trophies).toEqual([]);
    expect(slide(s, "top")!.line).toBe("Highest you climbed: #4 after game 1");
  });

  it("a $0 best night is still the best night", () => {
    const even = small(
      [closed("s", "Season 1", "2026-10-01", "2026-10-02")],
      [game("g1", "s", "2026-10-01", { a: [1000, 1500], b: [1000, 1000], c: [1000, 500] })],
    );
    expect(slide(wrappedModel(even, "s", "b")!.slides, "bestNight")!.heading).toBe("Your best night");
  });
});

describe("top: never led", () => {
  it("names the best rank and the first game it was reached", () => {
    const data = small(
      [closed("s", "Season 1", "2026-10-01", "2026-10-10")],
      [
        game("g1", "s", "2026-10-01", { a: [1000, 1500], b: [1000, 600], c: [1000, 900] }),
        game("g2", "s", "2026-10-02", { a: [1000, 1100], b: [1000, 1300], c: [1000, 600] }),
        game("g3", "s", "2026-10-03", { a: [1000, 1000], b: [1000, 1000], c: [1000, 1000] }),
      ],
    );
    // b: 3rd after game 1, 2nd after game 2 and 3; never #1.
    expect(slide(wrappedModel(data, "s", "b")!.slides, "top")).toMatchObject({
      ledAfter: 0,
      bestRank: 2,
      firstReachedGame: 2,
      line: "Highest you climbed: #2 after game 2",
    });
  });
});

describe("trophies", () => {
  it("a 2-player season: last place holds silver and the spoon, medal first", () => {
    const data = small([closed("s", "Season 1", "2026-10-01", "2026-10-02")], [game("g1", "s", "2026-10-01", { a: [1000, 1400], b: [1000, 600] })]);
    expect(slide(wrappedModel(data, "s", "b")!.slides, "finish")!.trophies.map((t) => t.kind)).toEqual(["silver", "spoon"]);
    expect(slide(wrappedModel(data, "s", "a")!.slides, "finish")!.trophies.map((t) => t.kind)).toEqual(["gold"]);
    expect(slide(wrappedModel(data, "s", "a")!.slides, "finale")!.highlight).toBe("Season champion");
  });
});

describe("×N counts within this season only", () => {
  // Amit is a Whale (win $2,000+) once in Season 1 and twice in Season 2; his best Season 2 night is the second.
  const data = small(
    [closed("s1", "Season 1", "2026-09-01", "2026-09-30"), closed("s2", "Season 2", "2026-10-01", "2026-10-30")],
    [
      game("g1", "s1", "2026-09-05", { a: [1000, 3000], b: [3000, 1000] }),
      game("g2", "s2", "2026-10-05", { a: [1000, 3000], b: [3000, 1000] }),
      game("g3", "s2", "2026-10-12", { a: [1000, 3500], b: [3500, 1000] }),
    ],
  );

  it("an earlier season's badge doesn't raise this season's count", () => {
    const s1 = wrappedModel(data, "s1", "a")!.slides;
    expect(slide(s1, "bestNight")!.badges.find((b) => b.kind === "whale")).toMatchObject({ count: 1, label: "Whale" });

    const s2 = wrappedModel(data, "s2", "a")!.slides;
    // All-time, g3 was his third Whale (the results card's running count) …
    expect(badgesInGame(data, "g3").find((b) => b.playerId === "a" && b.kind === "whale")!.count).toBe(3);
    // … but in Season 2's Wrapped it's the second, on both slides.
    expect(slide(s2, "bestNight")).toMatchObject({ gameId: "g3" });
    expect(slide(s2, "bestNight")!.badges.find((b) => b.kind === "whale")).toMatchObject({ count: 2, label: "Whale ×2" });
    expect(slide(s2, "badges")!.badges.find((b) => b.kind === "whale")).toMatchObject({ count: 2, label: "Whale ×2" });
  });

  it("the best-night count is the running count up to that night", () => {
    // Season 2's best night first (g2), a smaller Whale after it (g3).
    const flipped = small(data.seasons, [
      data.games[0]!,
      game("g2", "s2", "2026-10-05", { a: [1000, 3500], b: [3500, 1000] }),
      game("g3", "s2", "2026-10-12", { a: [1000, 3000], b: [3000, 1000] }),
    ]);
    const s = wrappedModel(flipped, "s2", "a")!.slides;
    expect(slide(s, "bestNight")!.badges.find((b) => b.kind === "whale")).toMatchObject({ count: 1 });
    expect(slide(s, "badges")!.badges.find((b) => b.kind === "whale")).toMatchObject({ count: 2 });
  });
});

describe("season-close badges count this season only", () => {
  // Amit wins Season 1, Bina wins Season 2; both are on the podium (3 players) in both seasons.
  const data = small(
    [closed("s1", "Season 1", "2026-09-01", "2026-09-30"), closed("s2", "Season 2", "2026-10-01", "2026-10-30")],
    [
      game("g1", "s1", "2026-09-05", { a: [1000, 1500], b: [1000, 1200], c: [1000, 300] }),
      game("g2", "s2", "2026-10-05", { a: [1000, 1200], b: [1000, 1500], c: [1000, 300] }),
    ],
  );
  const close = (seasonId: string, playerId: string) =>
    slide(wrappedModel(data, seasonId, playerId)!.slides, "badges")!.badges.filter((b) =>
      ["champion", "podium", "woodenSpoon"].includes(b.kind),
    );

  it("a podium in two seasons shows Podium ×1 in each, and Champion where earned", () => {
    expect(close("s1", "a").map((b) => b.label)).toEqual(["Season champion", "Podium"]);
    expect(close("s2", "a").map((b) => b.label)).toEqual(["Podium"]);
    expect(close("s1", "b").map((b) => b.label)).toEqual(["Podium"]);
    expect(close("s2", "b").map((b) => b.label)).toEqual(["Season champion", "Podium"]);
    // Chetan: last both times, a bronze and a spoon each season.
    expect(close("s2", "c").map((b) => b.label)).toEqual(["Podium", "Wooden spoon"]);
  });

  it("the finale headline uses this season's close badges", () => {
    expect(slide(wrappedModel(data, "s2", "a")!.slides, "finale")!.highlight).toBe("Podium");
    expect(slide(wrappedModel(data, "s2", "b")!.slides, "finale")!.highlight).toBe("Season champion");
    expect(slide(wrappedModel(data, "s2", "c")!.slides, "finale")!.highlight).toBe("Podium");
  });
});
