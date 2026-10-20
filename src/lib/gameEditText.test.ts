import { describe, expect, it } from "vitest";
import { deleteGameChange, draftFromGame, editCheck, editGameChange, restoreGameChange, type GameDraft } from "../domain/gameEdits.js";
import { migrate } from "../domain/migrations.js";
import type { Data, Game, Player } from "../domain/types.js";
import { championChangeLine, closedSeasonWarning, editDiffLines, gameSummary } from "./gameEditText.js";

const NOW = "2026-10-20T12:00:00.000Z";
const TODAY = "2026-10-20";
const player = (id: string, name: string, type: Player["type"] = "regular"): Player => ({ id, name, type, status: "active", createdAt: NOW });

function game(id: string, seasonId: string, date: string, buyIns: [string, number][], cashOuts: Record<string, number>, mode: Game["mode"] = "season"): Game {
  return {
    id,
    seasonId,
    date,
    mode,
    status: "finished",
    players: Object.keys(cashOuts),
    buyIns: buyIns.map(([p, amount], i) => ({ player: p, amount, at: `${date}T20:0${i}:00.000Z` })),
    cashOuts: Object.entries(cashOuts).map(([p, amount]) => ({ player: p, amount })),
    createdAt: `${date}T19:00:00.000Z`,
  };
}

function fixture(): Data {
  return migrate({
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: [player("am", "Amit"), player("sh", "Shreyas"), player("vi", "Vik"), player("gu", "Rohan", "guest")],
    seasons: [
      { id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-01", endedOn: "2026-10-10" },
      { id: "s2", name: "Season 2", status: "active", startedOn: "2026-10-11" },
    ],
    games: [
      // Amit +500, Shreyas +200, Vik −700 (Amit bought in twice: $1,000 then $500).
      game("a1", "s1", "2026-10-02", [["am", 1000], ["sh", 1000], ["vi", 1000], ["am", 500]], { am: 2000, sh: 1200, vi: 300 }),
      game("b3", "s2", "2026-10-15", [["am", 1000], ["gu", 1000]], { am: 500, gu: 1500 }, "incognito"),
    ],
    liveGame: null,
  });
}

const nameOf = (id: string) => ({ am: "Amit", sh: "Shreyas", vi: "Vik", gu: "Rohan" })[id] ?? id;

function diff(d: Data, id: string, edit: (draft: GameDraft) => GameDraft): string[] {
  const before = d.games.find((g) => g.id === id)!;
  const draft = edit(draftFromGame(before));
  const c = editCheck(d, before, draft, nameOf, TODAY, NOW);
  return editDiffLines(d, before, draft, c.game, c.promote);
}

describe("editDiffLines (the Save confirm)", () => {
  it("nothing changed: no lines", () => {
    expect(diff(fixture(), "a1", (x) => x)).toEqual([]);
  });

  it("date, mode, changed / removed / new buy-ins and final stacks, old → new", () => {
    const lines = diff(fixture(), "a1", (x) => ({
      ...x,
      date: "2026-10-03",
      mode: "incognito",
      buyIns: {
        ...x.buyIns,
        am: [{ amount: "1000", index: 0 }], // removed the $500 rebuy (buy-in 2)
        sh: [{ amount: "1,500", index: 1 }, { amount: "200", index: null }],
      },
      stacks: { ...x.stacks, am: "1300", sh: "2600" },
    }));
    expect(lines).toEqual([
      "Date: Fri, Oct 2 → Sat, Oct 3",
      "Mode: Season → Incognito (no longer counts in the standings)",
      "Amit: removed buy-in 2 ($500)",
      "Amit: final stack $2,000 → $1,300",
      "Shreyas: buy-in 1 $1,000 → $1,500",
      "Shreyas: new buy-in $200",
      "Shreyas: final stack $1,200 → $2,600",
    ]);
  });

  it("players added and removed", () => {
    const lines = diff(fixture(), "a1", (x) => {
      const { vi: _vi, ...buyIns } = x.buyIns;
      return {
        ...x,
        players: ["am", "sh", "gu"],
        buyIns: { ...buyIns, gu: [{ amount: "1000", index: null }, { amount: "500", index: null }] },
        stacks: { ...x.stacks, gu: "0" },
        guestChoice: "promote",
      };
    });
    expect(lines).toEqual([
      "Removed Vik ($1,000 in, $300 out)",
      "Added Rohan: buy-ins $1,000 · $500, final stack $0",
      "Promotes guest Rohan to regular",
    ]);
  });

  it("incognito → season with a promoted guest", () => {
    const lines = diff(fixture(), "b3", (x) => ({ ...x, mode: "season", guestChoice: "promote" }));
    expect(lines).toEqual(["Mode: Incognito → Season (now counts in the standings)", "Promotes guest Rohan to regular"]);
  });
});

describe("gameSummary (delete and restore confirms)", () => {
  it("names the date, season, players and winner", () => {
    const d = fixture();
    expect(gameSummary(d, d.games[0]!)).toBe("Fri, Oct 2 · Season 1 · Amit, Shreyas, Vik · Winner: Amit +$500");
    expect(gameSummary(d, d.games[1]!)).toBe("Thu, Oct 15 · Season 2 · Incognito · Amit, Rohan · Winner: Rohan +$500");
  });

  it("tied winners, and a game nobody won", () => {
    const d = fixture();
    const tie = game("t", "s2", "2026-10-16", [["am", 1000], ["sh", 1000], ["vi", 1000]], { am: 1500, sh: 1500, vi: 0 });
    expect(gameSummary(d, tie)).toMatch(/Winner: Amit & Shreyas \+\$500$/);
    const even = game("e", "s2", "2026-10-16", [["am", 1000], ["sh", 1000]], { am: 1000, sh: 1000 });
    expect(gameSummary(d, even)).toMatch(/· No winner$/);
  });
});

describe("championChangeLine (closed seasons)", () => {
  const WARN = "This season is closed. Editing will change its final standings and possibly its champion.";

  it("the warning before editing starts names the current champion", () => {
    const d = fixture();
    expect(closedSeasonWarning(d, d.seasons[0]!)).toBe(`${WARN} Current champion: Amit (+$500).`);
    expect(closedSeasonWarning(deleteGameChange("a1", NOW)(d), d.seasons[0]!)).toBe(`${WARN} It has no champion right now.`);
  });

  it("names the champion now versus after, when it changes", () => {
    const d = fixture();
    const before = d.games[0]!;
    const c = editCheck(d, before, { ...draftFromGame(before), stacks: { am: "1300", sh: "1900", vi: "300" } }, nameOf, TODAY, NOW);
    const after = editGameChange({ before, after: c.game, promote: [] })(d);
    expect(championChangeLine(d, after, d.seasons[0]!, "edit")).toBe(
      `${WARN} Champion now: Amit (+$500). After this edit: Shreyas (+$900).`,
    );
  });

  it("says when the champion stays (with the new total)", () => {
    const d = fixture();
    const before = d.games[0]!;
    const c = editCheck(d, before, { ...draftFromGame(before), stacks: { am: "2100", sh: "1100", vi: "300" } }, nameOf, TODAY, NOW);
    const after = editGameChange({ before, after: c.game, promote: [] })(d);
    expect(championChangeLine(d, after, d.seasons[0]!, "edit")).toBe(`${WARN} Amit stays champion (+$500 → +$600).`);
    expect(championChangeLine(d, d, d.seasons[0]!, "edit")).toBe(`${WARN} Amit stays champion (+$500).`);
  });

  it("delete and restore wording, including no champion left", () => {
    const d = fixture();
    const deleted = deleteGameChange("a1", NOW)(d);
    expect(championChangeLine(d, deleted, d.seasons[0]!, "delete")).toBe(
      "This season is closed. Deleting will change its final standings and possibly its champion. " +
        "Champion now: Amit (+$500). After this delete: no champion (no season games left).",
    );
    expect(championChangeLine(deleted, restoreGameChange("a1")(deleted), d.seasons[0]!, "restore")).toBe(
      "This season is closed. Restoring will change its final standings and possibly its champion. " +
        "No champion now. After this restore: Amit (+$500).",
    );
  });
});
