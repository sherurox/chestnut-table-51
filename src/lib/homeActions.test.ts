import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { needsLogin } from "../admin/gate.js";
import { HomeActions } from "../components/HomeActions.js";
import type { LocalGame } from "../domain/liveGame.js";
import type { Data } from "../domain/types.js";
import { MemoryStore } from "../storage/__test__/memoryStore.js";
import { LIVE_GAME_KEY } from "../storage/localKeys.js";
import {
  formatElapsed,
  formatStarted,
  localGameSummary,
  needsNewSeason,
  otherPhoneGame,
  startGamePath,
  startModeFromSearch,
} from "./homeActions.js";

const localGame: LocalGame = {
  v: 1,
  id: "game0001",
  seasonId: "s1",
  date: "2026-10-19",
  startedAt: "2026-10-19T21:04:00.000Z",
  startMode: "season",
  startPlayers: ["a", "b"],
  startPromote: [],
  actions: [
    { type: "buyIn", player: "a", amount: 1000, at: "2026-10-19T21:05:00.000Z" },
    { type: "buyIn", player: "b", amount: 1500, at: "2026-10-19T21:05:00.000Z" },
    { type: "buyIn", player: "a", amount: 2000, at: "2026-10-19T22:00:00.000Z" },
  ],
  finalStacks: {},
  markerSynced: true,
};

const data = (liveGame: Data["liveGame"]): Data => ({
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: [],
  seasons: [],
  games: [],
  liveGame,
});

describe("Start game mode preselection", () => {
  it("Home buttons link to Start with the mode in the query", () => {
    expect(startGamePath("season")).toBe("/admin/start?mode=season");
    expect(startGamePath("incognito")).toBe("/admin/start?mode=incognito");
  });

  it("reads the mode from the route, defaulting to a season game", () => {
    expect(startModeFromSearch("?mode=incognito")).toBe("incognito");
    expect(startModeFromSearch("?mode=season")).toBe("season");
    expect(startModeFromSearch("")).toBe("season");
    expect(startModeFromSearch("?mode=bogus")).toBe("season");
  });

  it("round-trips: each Home button preselects its own mode", () => {
    for (const mode of ["season", "incognito"] as const) {
      const search = startGamePath(mode).slice(startGamePath(mode).indexOf("?"));
      expect(startModeFromSearch(search)).toBe(mode);
    }
  });
});

describe("mode preserved through login", () => {
  it("logged out, Start shows the login gate in place (same route); once logged in, Start itself", () => {
    // The gate never navigates: it renders instead of Start at /admin/start?mode=…, so the query that
    // Start reads on mount after unlocking is the one the Home button set.
    expect(needsLogin(false, false, "/admin/start")).toBe(true);
    expect(needsLogin(true, false, "/admin/start")).toBe(false);
    expect(startModeFromSearch("?mode=incognito")).toBe("incognito");
  });

  it("a game on this phone still opens live/end without login, but not Start", () => {
    expect(needsLogin(false, true, "/admin/live")).toBe(false);
    expect(needsLogin(false, true, "/admin/end")).toBe(false);
    expect(needsLogin(false, true, "/admin/start")).toBe(true);
    expect(needsLogin(false, false, "/admin/live")).toBe(true);
  });
});

describe("local game summary", () => {
  it("reads the table total and start time from the raw key", () => {
    expect(localGameSummary(JSON.stringify(localGame))).toEqual({
      id: "game0001",
      startedAt: "2026-10-19T21:04:00.000Z",
      tableTotal: 4500,
    });
  });

  it("no key, or an unreadable one, means no local game", () => {
    expect(localGameSummary(null)).toBeNull();
    expect(localGameSummary("{nope")).toBeNull();
    expect(localGameSummary(JSON.stringify({ v: 2 }))).toBeNull();
  });

  it("formats elapsed time and never goes negative", () => {
    const start = "2026-10-19T21:04:00.000Z";
    expect(formatElapsed(start, Date.parse("2026-10-19T21:16:30.000Z"))).toBe("12m");
    expect(formatElapsed(start, Date.parse("2026-10-19T23:09:00.000Z"))).toBe("2h 05m");
    expect(formatElapsed(start, Date.parse("2026-10-19T20:00:00.000Z"))).toBe("0m");
  });

  it("formats the start time, with the date only when it wasn't today", () => {
    const start = new Date(2026, 9, 19, 21, 4).toISOString();
    expect(formatStarted(start, new Date(2026, 9, 19, 23, 0))).toBe("9:04 PM");
    expect(formatStarted(start, new Date(2026, 9, 20, 1, 0))).toBe("Oct 19, 9:04 PM");
  });
});

describe("game on another phone", () => {
  const marker = { gameId: "other001", startedAt: "2026-10-19T21:04:00.000Z" };
  it("notes a marker for a game that isn't on this phone", () => {
    expect(otherPhoneGame(data(marker), null)).toEqual(marker);
    expect(otherPhoneGame(data(null), null)).toBeNull();
    expect(otherPhoneGame(null, null)).toBeNull();
  });
  it("not when the marker is this phone's own game", () => {
    const own = localGameSummary(JSON.stringify({ ...localGame, id: "other001" }));
    expect(otherPhoneGame(data(marker), own)).toBeNull();
  });
});

describe("HomeActions", () => {
  let store: MemoryStore;
  beforeEach(() => {
    store = new MemoryStore();
    vi.stubGlobal("localStorage", store);
  });
  afterEach(() => vi.unstubAllGlobals());

  const endedData: Data = {
    ...data(null),
    seasons: [{ id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-15", endedOn: "2026-10-20" }],
  };
  const render = (d: Data | null) =>
    renderToString(createElement(MemoryRouter, null, createElement(HomeActions, { data: d })));

  it("shows both game buttons when this phone has no local game", () => {
    const html = render(data(null));
    expect(html).toContain("New season game");
    expect(html).toContain('href="/admin/start?mode=season"');
    expect(html).toContain("Incognito game");
    expect(html).toContain('href="/admin/start?mode=incognito"');
    expect(html).not.toContain("Game on");
  });

  it("shows only the Game on card when a local game exists", () => {
    store.setItem(LIVE_GAME_KEY, JSON.stringify(localGame));
    const html = render(data({ gameId: localGame.id, startedAt: localGame.startedAt }));
    expect(html).toContain("Game on");
    expect(html).toContain("$4,500");
    expect(html).toContain('href="/admin/live"');
    expect(html).not.toContain("New season game");
    expect(html).not.toContain("Incognito game");
    expect(html).not.toContain("another phone");
  });

  it("shows the other-phone note above the buttons, which still work", () => {
    const html = render(data({ gameId: "other001", startedAt: "2026-10-19T21:04:00.000Z" }));
    expect(html).toContain("A game is in progress on another phone (started ");
    expect(html.indexOf("another phone")).toBeLessThan(html.indexOf("New season game"));
    expect(html).toContain('href="/admin/start?mode=season"');
  });

  it("buttons still show before data loads (offline, nothing cached)", () => {
    expect(render(null)).toContain("New season game");
  });

  it("after End season: one 'Start a new season first' link to Admin → Seasons instead of the game buttons", () => {
    const html = render(endedData);
    expect(html).toContain("Start a new season first");
    expect(html).toContain('href="/admin/seasons"');
    expect(html).not.toContain("New season game");
    expect(html).not.toContain("Incognito game");
  });

  it("after End season, a game still on this phone keeps its Game on card", () => {
    store.setItem(LIVE_GAME_KEY, JSON.stringify(localGame));
    const html = render(endedData);
    expect(html).toContain("Game on");
    expect(html).not.toContain("Start a new season first");
  });
});

describe("needsNewSeason (after End season)", () => {
  const base: Data = { version: 1, settings: { presetBuyIns: [1000] }, players: [], seasons: [], games: [], liveGame: null };
  it("only when seasons exist and none is active", () => {
    expect(needsNewSeason(null)).toBe(false);
    expect(needsNewSeason(base)).toBe(false);
    expect(needsNewSeason({ ...base, seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-15" }] })).toBe(false);
    expect(
      needsNewSeason({ ...base, seasons: [{ id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-15", endedOn: "2026-10-20" }] }),
    ).toBe(true);
  });
});
