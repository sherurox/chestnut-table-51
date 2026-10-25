import { describe, expect, it } from "vitest";
import { winnerLine } from "../domain/quotes.js";
import type { Data, Game, Season } from "../domain/types.js";
import { resultsCardModel } from "./resultsCard.js";

const NOW = "2026-10-24T21:00:00.000Z";

// stacks: player → [buy-in, final stack]
function game(id: string, date: string, stacks: Record<string, [number, number]>, overrides: Partial<Game> = {}): Game {
  const players = Object.keys(stacks);
  return {
    id,
    seasonId: "s1",
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: stacks[p]![0], at: NOW })),
    cashOuts: players.map((p) => ({ player: p, amount: stacks[p]![1] })),
    createdAt: `${date}T21:00:00.000Z`,
    ...overrides,
  };
}

const ACTIVE: Season = { id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" };

function data(games: Game[], season: Season = ACTIVE): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: [
      { id: "s", name: "Shreyas", type: "regular", status: "active", createdAt: NOW },
      { id: "r", name: "Rohan", type: "regular", status: "active", createdAt: NOW },
      { id: "a", name: "Amit", type: "regular", status: "active", createdAt: NOW },
    ],
    seasons: [season],
    games,
    liveGame: null,
  };
}

const g1 = game("g1", "2026-10-20", { s: [1000, 3350], r: [1000, 0], a: [1000, 650] });
const g2 = game("g2", "2026-10-24", { s: [1000, 0], r: [1000, 2500], a: [1000, 500] });

describe("resultsCardModel", () => {
  it("a season game: header, game number, Man of the Match, others sorted, badges, leader", () => {
    const d = data([g1, g2]);
    const card = resultsCardModel(d, g2);
    expect(card.title).toBe("CHESTNUT TABLE 51");
    expect(card.date).toBe("Sat 24 Oct");
    expect(card.label).toEqual({ kind: "season", seasonName: "Season 1", gameText: "GAME 2 OF 10" });
    expect(card.manOfTheMatch).toEqual({
      names: ["Rohan"],
      name: "Rohan",
      result: 1500,
      resultText: "+$1,500",
      line: winnerLine("g2"),
    });
    expect(card.others.map((o) => `${o.name} ${o.resultText}`)).toEqual(["Amit −$500", "Shreyas −$1,000"]);
    expect(card.badges).toEqual([
      "Shreyas: Felted",
      "Rohan: First blood",
      "Rohan: Double up",
      "Rohan: Lone wolf",
      "Rohan: Giant slayer", // Shreyas led going in and finished down
      "Rohan: Bounce back", // lost $1,000 last time
    ]);
    // Shreyas +2,350 −1,000 = +1,350; Rohan −1,000 +1,500 = +500.
    expect(card.standingLine).toEqual({ kind: "leader", text: "Season leader: Shreyas +$1,350" });
    expect(card.footer).toBe("Paisa he paisa hoga");
  });

  it("an incognito game: label only, no number, leader or badges", () => {
    const inc = game("i1", "2026-10-22", { s: [1000, 0], r: [1000, 2000] }, { mode: "incognito" });
    const card = resultsCardModel(data([g1, inc]), inc);
    expect(card.label).toEqual({ kind: "incognito", text: "INCOGNITO" });
    expect(card.badges).toEqual([]);
    expect(card.standingLine).toBeNull();
    expect(card.manOfTheMatch?.name).toBe("Rohan");
  });

  it("a tie shares Man of the Match (names joined with &, A→Z)", () => {
    const tie = game("t1", "2026-10-21", { s: [1000, 1500], r: [1000, 1500], a: [1000, 0] });
    const card = resultsCardModel(data([tie]), tie);
    expect(card.manOfTheMatch?.names).toEqual(["Rohan", "Shreyas"]);
    expect(card.manOfTheMatch?.name).toBe("Rohan & Shreyas");
    expect(card.manOfTheMatch?.resultText).toBe("+$500");
    expect(card.others.map((o) => o.name)).toEqual(["Amit"]);
  });

  it("nobody finished up: no Man of the Match and no line, everyone in the list", () => {
    const flat = game("f1", "2026-10-21", { s: [1000, 1000], r: [1000, 1000] });
    const card = resultsCardModel(data([flat]), flat);
    expect(card.manOfTheMatch).toBeNull();
    expect(card.others.map((o) => `${o.name} ${o.resultText}`)).toEqual(["Rohan $0", "Shreyas $0"]);
  });

  it("the leader is as of that game, not today", () => {
    const d = data([g1, g2, game("g3", "2026-10-25", { s: [1000, 0], r: [1000, 3000], a: [1000, 0] })]);
    expect(resultsCardModel(d, g1).standingLine?.text).toBe("Season leader: Shreyas +$2,350");
    expect(resultsCardModel(d, g1).label).toMatchObject({ gameText: "GAME 1 OF 10" });
  });

  it("a closed season's last game shows the champion instead of the leader (ended by hand too)", () => {
    const closed: Season = { ...ACTIVE, status: "closed", endedOn: "2026-10-24" };
    const d = data([g1, g2], closed);
    expect(resultsCardModel(d, g2).standingLine).toEqual({ kind: "champion", text: "Season 1 champion: Shreyas +$1,350" });
    expect(resultsCardModel(d, g1).standingLine?.kind).toBe("leader");
  });

  it("past the limit the number has no 'OF 10'", () => {
    const games = Array.from({ length: 11 }, (_, i) =>
      game(`n${i + 1}`, `2026-10-${String(i + 1).padStart(2, "0")}`, { s: [1000, 1100], r: [1000, 900] }),
    );
    const d = data(games);
    expect(resultsCardModel(d, games[9]!).label).toMatchObject({ gameText: "GAME 10 OF 10" });
    expect(resultsCardModel(d, games[10]!).label).toMatchObject({ gameText: "GAME 11" });
  });

  it("repeat badges show ×N; milestones never do", () => {
    const d = data([g1, game("g2b", "2026-10-21", { s: [1000, 2500], r: [1000, 0], a: [1000, 500] })]);
    const badges = resultsCardModel(d, d.games[1]!).badges;
    expect(badges).toContain("Shreyas: Double up ×2");
    expect(badges).toContain("Rohan: Felted ×2");
    expect(badges.some((b) => b.startsWith("Shreyas: First blood"))).toBe(false);
  });

  it("the same game always gets the same winner line", () => {
    const d = data([g1, g2]);
    expect(resultsCardModel(d, g2).manOfTheMatch?.line).toBe(resultsCardModel(d, g2).manOfTheMatch?.line);
    expect(resultsCardModel(d, g2).manOfTheMatch?.line).toBe(winnerLine("g2"));
  });
});
