import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SeasonStatsPanel, StatsPanelBody, WordmarkButton } from "../components/SeasonStatsPanel.js";
import { INSTANT_PATHS, isInstant } from "../design/motion.js";
import { seasonSummary } from "../domain/fun.js";
import type { Data, Game } from "../domain/types.js";
import { offTheBooksText, statsPanelContent } from "./statsPanel.js";

const NAMES: Record<string, string> = { a: "Alice", b: "Bob", c: "Carol" };

// One seat: [player, buy-ins, final stack]. The caller keeps the chip check balanced.
type Seat = [string, number[], number];

function game(id: string, date: string, seats: Seat[], overrides: Partial<Game> = {}): Game {
  return {
    id,
    seasonId: "s1",
    date,
    mode: "season",
    status: "finished",
    players: seats.map(([p]) => p),
    buyIns: seats.flatMap(([p, amounts]) => amounts.map((amount) => ({ player: p, amount, at: "t" }))),
    cashOuts: seats.map(([p, , out]) => ({ player: p, amount: out })),
    createdAt: `${date}T22:00:00.000Z`,
    ...overrides,
  };
}

function data(games: Game[], extra: Partial<Data> = {}): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: ["a", "b", "c"].map((id) => ({ id, name: NAMES[id]!, type: "regular", status: "active", createdAt: "2026-01-01T00:00:00.000Z" })),
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games,
    liveGame: null,
    ...extra,
  };
}

const TODAY = "2026-10-10";

// Alice wins three nights in a row; Bob rebuys every night (rebuy king); one incognito and one deleted
// game that must not show up anywhere except the incognito count.
const busy = data([
  game("g1", "2026-10-02", [["a", [1000], 2500], ["b", [1000, 1000], 500]]),
  game("g2", "2026-10-03", [["a", [1000], 2000], ["b", [1000, 1000], 1000]]),
  game("g3", "2026-10-04", [["a", [1500], 3000], ["b", [1000, 1000], 500]]),
  game("gi", "2026-10-05", [["b", [1000], 9000], ["c", [1000, 7000], 0]], { mode: "incognito" }),
  game("gd", "2026-10-06", [["b", [1000], 9000], ["c", [1000, 7000], 0]], { status: "deleted" }),
]);

// Alice wins, then an even night: nobody is on a streak, and nobody rebuys.
const quiet = data([
  game("g1", "2026-10-02", [["a", [1000], 1400], ["b", [1000], 600]]),
  game("g2", "2026-10-03", [["a", [1000], 1000], ["b", [1000], 1000]]),
]);

const render = (el: ReturnType<typeof createElement>) => renderToString(createElement(MemoryRouter, null, el));

describe("statsPanelContent", () => {
  it("reads every number from seasonSummary", () => {
    const c = statsPanelContent(busy, TODAY)!;
    const s = seasonSummary(busy, "s1", TODAY)!;
    expect(c).toMatchObject({
      seasonName: s.name,
      day: s.daysRunning,
      gamesPlayed: s.gamesPlayed,
      totalBuyIns: s.totalBuyIns,
      incognitoGames: s.incognitoGames,
    });
    expect(c.biggestNight!.amount).toBe(s.biggestNight!.amount);
    expect(c).toMatchObject({
      seasonName: "Season 1",
      day: 10,
      gamesPlayed: 3,
      totalBuyIns: 3000 + 3000 + 3500,
      leader: { playerId: "a", name: "Alice", net: 1500 + 1000 + 1500 },
      biggestNight: { playerIds: ["a"], names: "Alice", amount: 1500, date: "2026-10-04" }, // g1 and g3 → the later night
      rebuyKing: { names: "Bob" },
      winStreak: { names: "Alice", length: 3 },
      incognitoGames: 1,
    });
  });

  it("gives the leader today's line", () => {
    expect(statsPanelContent(busy, TODAY)!.leader!.line).toEqual(expect.any(String));
    expect(statsPanelContent(busy, TODAY)!.leader!.line!.length).toBeGreaterThan(0);
  });

  it("lists the awards held so far, in the fixed order, with holders and values", () => {
    const awards = statsPanelContent(busy, TODAY)!.awards;
    // Iron Man and Rollercoaster are ties between everyone, so nobody holds them (seasonAwards' rule).
    expect(awards.map((a) => a.kind)).toEqual(["shark", "atm", "rock", "bigNight"]);
    expect(awards.find((a) => a.kind === "shark")).toEqual({ kind: "shark", name: "The Shark", holders: "Alice", value: "+$1,333 a game" });
    expect(awards.find((a) => a.kind === "atm")).toEqual({ kind: "atm", name: "Rebuy Machine", holders: "Bob", value: "3 rebuys" });
  });

  it("biggest night lists everyone tied for it, with the most recent of their dates", () => {
    // Bob +800 on the 3rd, Alice +800 on the 5th, Carol only +300.
    const tied = data([
      game("g1", "2026-10-03", [["b", [1000], 1800], ["a", [1000], 200]]),
      game("g2", "2026-10-05", [["a", [1000], 1800], ["c", [1000], 200]]),
      game("g3", "2026-10-06", [["c", [1000], 1300], ["b", [1000], 700]]),
    ]);
    expect(seasonSummary(tied, "s1", TODAY)!.biggestNight).toMatchObject({ name: "Bob", amount: 800 }); // one name only
    expect(statsPanelContent(tied, TODAY)!.biggestNight).toEqual({ playerIds: ["a", "b"], names: "Alice & Bob", amount: 800, date: "2026-10-05" });
  });

  it("biggest night tied on the same night keeps that date", () => {
    const sameNight = data([game("g1", "2026-10-03", [["a", [1000], 1500], ["b", [1000], 1500], ["c", [1000, 1000], 1000]])]);
    expect(statsPanelContent(sameNight, TODAY)!.biggestNight).toEqual({ playerIds: ["a", "b"], names: "Alice & Bob", amount: 500, date: "2026-10-03" });
  });

  it("biggest night shared by 3+ players drops the date", () => {
    const threeWay = data(
      [
        game("g1", "2026-10-03", [["a", [1000], 1400], ["d", [1000], 600]]),
        game("g2", "2026-10-04", [["b", [1000], 1400], ["d", [1000], 600]]),
        game("g3", "2026-10-05", [["c", [1000], 1400], ["d", [1000], 600]]),
      ],
      { players: ["a", "b", "c", "d"].map((id) => ({ id, name: NAMES[id] ?? "Dave", type: "regular", status: "active", createdAt: "2026-01-01T00:00:00.000Z" })) },
    );
    expect(statsPanelContent(threeWay, TODAY)!.biggestNight).toEqual({ playerIds: ["a", "b", "c"], names: "Alice, Bob & Carol", amount: 400, date: null });
    const html = render(createElement(StatsPanelBody, { content: statsPanelContent(threeWay, TODAY), animate: false, onLeaderboard: () => {} }));
    expect(html).toContain("Alice, Bob &amp; Carol");
    expect(html).not.toContain("Oct 5");
  });

  it("no rebuy king and no streak → both null", () => {
    const c = statsPanelContent(quiet, TODAY)!;
    expect(c.rebuyKing).toBeNull();
    expect(c.winStreak).toBeNull();
    expect(c.leader).toMatchObject({ name: "Alice", net: 400 });
    expect(c.incognitoGames).toBe(0);
  });

  it("no active season → null", () => {
    const closed = { ...busy, seasons: [{ ...busy.seasons[0]!, status: "closed" as const, endedOn: "2026-10-09" }] };
    expect(statsPanelContent(closed, TODAY)).toBeNull();
    expect(statsPanelContent(data([], { seasons: [] }), TODAY)).toBeNull();
  });

  it("a season with no games yet has no leader or night", () => {
    expect(statsPanelContent(data([]), TODAY)).toMatchObject({ gamesPlayed: 0, totalBuyIns: 0, leader: null, biggestNight: null, awards: [] });
  });

  it("incognito games are a separate count, off the books", () => {
    expect(offTheBooksText(0)).toBeNull();
    expect(offTheBooksText(2)).toBe("+ 2 incognito, off the books");
  });
});

describe("panel body", () => {
  it("shows the rebuy king and streak rows only when there are any", () => {
    const busyHtml = render(createElement(StatsPanelBody, { content: statsPanelContent(busy, TODAY), animate: false, onLeaderboard: () => {} }));
    expect(busyHtml).toContain("Rebuy king");
    expect(busyHtml).toContain("Longest win streak");
    expect(busyHtml).toContain("3 in a row");
    expect(busyHtml).toContain("+ 1 incognito, off the books");
    expect(busyHtml).toContain("Awards so far");

    const quietHtml = render(createElement(StatsPanelBody, { content: statsPanelContent(quiet, TODAY), animate: false, onLeaderboard: () => {} }));
    expect(quietHtml).not.toContain("Rebuy king");
    expect(quietHtml).not.toContain("Longest win streak");
    expect(quietHtml).not.toContain("off the books");
    expect(quietHtml).toContain("Leader");
  });

  it("no active season: says so", () => {
    const html = render(createElement(StatsPanelBody, { content: null, animate: false, onLeaderboard: () => {} }));
    expect(html).toContain("No season running yet");
  });

  it("links to the leaderboard", () => {
    const html = render(createElement(StatsPanelBody, { content: statsPanelContent(busy, TODAY), animate: false, onLeaderboard: () => {} }));
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Leaderboard<\/a>/);
  });
});

describe("instant mode (live/end screens, reduced motion)", () => {
  it("live and end screens are instant; other screens animate", () => {
    expect(INSTANT_PATHS).toEqual(["/admin/live", "/admin/end"]);
    expect(isInstant("/admin/live", false)).toBe(true);
    expect(isInstant("/admin/end", false)).toBe(true);
    for (const path of ["/", "/players/a", "/games", "/admin", "/admin/start"]) expect(isInstant(path, false)).toBe(false);
  });

  it("reduced motion is instant everywhere", () => {
    for (const path of ["/", "/players/a", "/admin/live"]) expect(isInstant(path, true)).toBe(true);
  });

  const panel = (instant: boolean) =>
    render(createElement(SeasonStatsPanel, { open: true, instant, data: busy, onClose: () => {}, returnFocus: { current: null } }));

  it("instant: no slide (data-instant) and the numbers show final at once", () => {
    const html = panel(true);
    expect(html).toContain('role="dialog"');
    expect(html.match(/data-instant=""/g)).toHaveLength(2); // backdrop + sheet
    expect(html).toContain('<span aria-hidden="true">3</span>'); // games, not counting up from 0
    expect(html).toContain('<span aria-hidden="true">$9,500</span>');
  });

  it("animated: slides up and the numbers count up from 0", () => {
    const html = panel(false);
    expect(html).not.toContain("data-instant");
    expect(html).toContain('aria-label="$9,500"');
    expect(html).toContain('<span aria-hidden="true">$0</span>');
  });

  it("closed: nothing is drawn", () => {
    const html = render(createElement(SeasonStatsPanel, { open: false, instant: false, data: busy, onClose: () => {}, returnFocus: { current: null } }));
    expect(html).toBe("");
  });

  it("every panel animation is switched off by prefers-reduced-motion", () => {
    const css = readFileSync(new URL("../design/design.css", import.meta.url), "utf-8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const selectors = reduced.slice(0, reduced.indexOf("{")).concat(reduced.slice(reduced.indexOf("{") + 1, reduced.indexOf("animation: none")));
    for (const sel of [".ct-sheet-backdrop", ".ct-sheet", ".ct-wordmark-btn .ct-chip-badge"]) expect(selectors).toContain(sel);
  });
});

describe("header wordmark", () => {
  // AppShell (the layout of every route) renders this in the header.
  it("is a Season stats button that opens a dialog", () => {
    const html = render(createElement(WordmarkButton, { open: false, instant: false, onOpen: () => {}, ref: { current: null } }));
    expect(html).toMatch(/^<button[^>]*aria-label="Season stats"/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("data-spin"); // spins only on a tap
  });
});
