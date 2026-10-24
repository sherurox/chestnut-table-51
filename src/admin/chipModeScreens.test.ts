import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { replayBox } from "../domain/chipBox.js";
import { liveState, setChipCounts, type LocalGame } from "../domain/liveGame.js";
import { boxLine } from "../lib/chipText.js";
import type { Data } from "../domain/types.js";

// Chip mode (Table tools step E). Off must give exactly the live and end screens from before chip mode:
// the snapshots were recorded from the screens before step E (the $5 custom buy-in rule is tested on its
// own). On adds the box line and the per-colour hint, and the hint never blocks Save.

const current = vi.hoisted(() => ({ chipMode: false, game: null as unknown }));

const data: Data = {
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: ["Andhar", "Bahar", "Chhota"].map((name, i) => ({
    id: `p${i}`,
    name,
    type: "regular",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
  })),
  seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
  games: [],
  liveGame: null,
};

const game: LocalGame = {
  v: 1,
  id: "g1",
  seasonId: "s1",
  date: "2026-10-24",
  startedAt: "2026-10-24T20:00:00.000Z",
  startMode: "season",
  startPlayers: ["p0", "p1", "p2"],
  startPromote: [],
  actions: [
    { type: "buyIn", player: "p0", amount: 1000, at: "2026-10-24T20:01:00.000Z" },
    { type: "buyIn", player: "p1", amount: 1000, at: "2026-10-24T20:02:00.000Z" },
    { type: "buyIn", player: "p2", amount: 1500, at: "2026-10-24T20:03:00.000Z" },
    { type: "buyIn", player: "p0", amount: 1000, at: "2026-10-24T20:04:00.000Z" },
  ],
  finalStacks: { p0: "2,500", p1: "500" },
  markerSynced: true,
};

vi.mock("../state/DataContext.js", () => ({ useData: () => ({ data, refresh: () => {}, applySaved: () => {} }) }));
vi.mock("./localHooks.js", () => ({
  useLocalGame: () => current.game,
  useQueue: () => [],
  useGameUpdater: () => ({ update: () => true, error: null, setError: () => {} }),
}));
vi.mock("./ui.js", async (orig) => ({ ...(await orig<object>()), useLoggedIn: () => true }));
vi.mock("./sync.js", () => ({ useSync: () => ({ syncNow: async () => {} }) }));
vi.mock("../lib/chipMode.js", async (orig) => ({ ...(await orig<object>()), useChipMode: () => current.chipMode }));

const render = async (name: "LiveGame" | "EndGame") => {
  const mod = name === "LiveGame" ? await import("./LiveGame.js") : await import("./EndGame.js");
  const Screen = (mod as unknown as Record<string, ComponentType>)[name]!;
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Screen)));
};

describe("Chip mode Off gives the old screens", () => {
  it("live screen", async () => {
    Object.assign(current, { chipMode: false, game });
    await expect(await render("LiveGame")).toMatchFileSnapshot("./__snapshots__/chipModeOff.live.html");
  });
  it("end screen", async () => {
    Object.assign(current, { chipMode: false, game });
    await expect(await render("EndGame")).toMatchFileSnapshot("./__snapshots__/chipModeOff.end.html");
  });
});

describe("Chip mode On", () => {
  it("live screen shows what's left in the box", async () => {
    Object.assign(current, { chipMode: true, game });
    const text = (await render("LiveGame")).replace(/<[^>]+>/g, "");
    expect(text).toContain(boxLine(replayBox(liveState(game).buyIns).left));
    expect(text).toContain("Box: 54 white · 5 red · 4 green · 28 blue · 32 black");
  });

  it("end screen: per-colour hint below the chip check, and Save is never blocked by it", async () => {
    // Buy-ins $4,500; the counts total $4,500 but differ per colour from what was handed out.
    let g: LocalGame = { ...game, finalStacks: {} };
    g = setChipCounts(g, "p0", [10, 10, 10, 5, 6]); // $1,200
    g = setChipCounts(g, "p1", [0, 0, 0, 0, 15]); // $1,500
    g = setChipCounts(g, "p2", [0, 30, 30, 10, 4]); // $1,800
    Object.assign(current, { chipMode: true, game: g });
    const html = await render("EndGame");
    expect(html).toContain("✓ Stacks match");
    expect(html.indexOf("Chips by colour")).toBeGreaterThan(html.indexOf("Chip check"));
    expect(html).toMatch(/counted than handed out/);
    expect(html).toContain("Swapping chips with the box for change can cause this.");
    expect(html).toMatch(/<button type="button" class="ct-btn ct-btn-primary w-full">Save game<\/button>/);
    expect(html).not.toContain("chip check must pass");
  });
});
