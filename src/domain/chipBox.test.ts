import { describe, expect, it } from "vitest";
import { CHIP_SET } from "../config.js";
import { MemoryStore } from "../storage/__test__/memoryStore.js";
import { loadLocalGame, saveLocalGame } from "../storage/localGame.js";
import { colorDifferences, countedPerColor, replayBox, untrackedBuyIns } from "./chipBox.js";
import { chipSplit, chipTotal } from "./chips.js";
import {
  addBuyIn,
  addLatePlayer,
  endCheck,
  finishLocalGame,
  liveState,
  removePlayer,
  setChipCounts,
  setFinalStack,
  setStackMode,
  stackModeOf,
  startGame,
  undo,
  type LocalGame,
} from "./liveGame.js";
import type { Data, Player } from "./types.js";

const NOW = "2026-10-24T21:04:00.000Z";
const at = (n: number) => `2026-10-24T21:${String(n).padStart(2, "0")}:00.000Z`;
const player = (id: string, name: string): Player => ({ id, name, type: "regular", status: "active", createdAt: NOW });
const data: Data = {
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: [player("a", "Andhar"), player("b", "Bahar"), player("c", "Chhota"), player("d", "Dada"), player("e", "Ek")],
  seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
  games: [],
  liveGame: null,
};
const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? id;
const boxOf = (left: readonly number[]) => CHIP_SET.map((c, i) => ({ ...c, count: left[i]! }));
const PREFERRED_1000 = [10, 10, 10, 5, 4];

function startWith(id: string, playerIds: string[]): LocalGame {
  return startGame(data, { id, playerIds, mode: "season", guestChoice: null, date: "2026-10-24", now: NOW });
}

function fourAtThousand(): LocalGame {
  let g = startWith("g1", ["a", "b", "c", "d"]);
  ["a", "b", "c", "d"].forEach((p, i) => (g = addBuyIn(g, p, 1000, at(i))));
  return g;
}

describe("box replay (derived from the buy-ins, never stored)", () => {
  it("is deterministic: the same buy-ins always give the same handouts and box", () => {
    const g = addBuyIn(addBuyIn(fourAtThousand(), "a", 1500, at(10)), "b", 2000, at(11));
    const first = replayBox(liveState(g).buyIns);
    const second = replayBox(liveState(structuredClone(g)).buyIns);
    expect(second).toEqual(first);
    expect(first.left).toEqual(CHIP_SET.map((c, i) => c.count - first.handedOut[i]!));
  });

  it("each suggestion is chipSplit for one player against what is left in the box", () => {
    const g = addBuyIn(addBuyIn(fourAtThousand(), "a", 1500, at(10)), "c", 1000, at(11));
    const replay = replayBox(liveState(g).buyIns);
    expect(replay.steps[0]!.split).toEqual(PREFERRED_1000);
    let left = CHIP_SET.map((c) => c.count);
    for (const step of replay.steps) {
      const expected = chipSplit(step.buyIn.amount, 1, boxOf(left));
      expect(expected.ok).toBe(true);
      if (!expected.ok) continue;
      expect(step.split).toEqual(expected.perPlayer);
      expect(chipTotal(step.split!)).toBe(step.buyIn.amount);
      left = expected.leftInBox;
    }
    expect(replay.left).toEqual(left);
  });

  it("undo drops the buy-in's chips: the box is back to the replay without it", () => {
    const before = fourAtThousand();
    const after = undo(addBuyIn(before, "a", 1500, at(10)));
    expect(replayBox(liveState(after).buyIns)).toEqual(replayBox(liveState(before).buyIns));
  });

  it("late and removed players need nothing special: only buy-ins, in order, count", () => {
    let g = startWith("g2", ["a", "b", "e"]);
    g = removePlayer(g, "e", at(1)); // picked by mistake
    g = addBuyIn(g, "a", 1000, at(2));
    g = addLatePlayer(data, g, "c", at(3));
    g = addBuyIn(g, "c", 1000, at(4));
    g = addBuyIn(g, "b", 1000, at(5));
    const replay = replayBox(liveState(g).buyIns);
    expect(replay.steps.map((s) => s.buyIn.player)).toEqual(["a", "c", "b"]);
    expect(replay.handedOut).toEqual(PREFERRED_1000.map((n) => n * 3));
    expect(replayBox(liveState(undo(g)).buyIns).handedOut).toEqual(PREFERRED_1000.map((n) => n * 2));
  });

  it("rebuys draw only from what's left: after 5 × $1,000 a $1,000 rebuy uses no red or green", () => {
    let g = startWith("g3", ["a", "b", "c", "d", "e"]);
    ["a", "b", "c", "d", "e"].forEach((p, i) => (g = addBuyIn(g, p, 1000, at(i))));
    expect(replayBox(liveState(g).buyIns).left).toEqual([50, 0, 0, 25, 30]);
    const replay = replayBox(liveState(addBuyIn(g, "a", 1000, at(9))).buyIns);
    const rebuy = replay.steps[5]!.split!;
    expect(rebuy[1]).toBe(0); // red
    expect(rebuy[2]).toBe(0); // green
    expect(chipTotal(rebuy)).toBe(1000);
    expect(replay.left.every((n) => n >= 0)).toBe(true);
  });

  it("a buy-in the box can't make is still recorded, marked not tracked, and leaves the box as it was", () => {
    const g = addBuyIn(fourAtThousand(), "a", 9000, at(10)); // only $5,500 is left in the box
    expect(liveState(g).buyIns.at(-1)).toMatchObject({ player: "a", amount: 9000 });
    const replay = replayBox(liveState(g).buyIns);
    const step = replay.steps.at(-1)!;
    expect(step.split).toBeNull();
    expect(step.failure).toBe("overBox");
    expect(replay.left).toEqual(replayBox(liveState(fourAtThousand()).buyIns).left);
    expect(untrackedBuyIns(replay)).toEqual([{ player: "a", amount: 9000 }]);
    // The next buy-in still draws from the real box.
    expect(replayBox(liveState(addBuyIn(g, "b", 1000, at(11))).buyIns).steps.at(-1)!.split).not.toBeNull();
  });

  it("compares chips counted per colour with chips handed out", () => {
    const counted = countedPerColor([
      [10, 10, 10, 5, 6],
      [10, 10, 10, 5, 2],
      [10, 10, 10, 5, 4],
      [7, 10, 10, 5, 6],
    ]);
    const handed = replayBox(liveState(fourAtThousand()).buyIns).handedOut;
    expect(colorDifferences(counted, handed)).toEqual([
      { color: "white", difference: -3 },
      { color: "black", difference: 2 },
    ]);
    expect(colorDifferences(handed, handed)).toEqual([]);
  });
});

describe("count chips on the end screen (local game only)", () => {
  it("counts fill the final stack; blank counts leave it blank", () => {
    let g = setChipCounts(fourAtThousand(), "a", [10, 10, 10, 5, 4]);
    expect(g.finalStacks.a).toBe("1000");
    expect(stackModeOf(g, "a")).toBe("chips");
    g = setChipCounts(g, "a", [null, 3, null, null, 2]);
    expect(g.finalStacks.a).toBe("230");
    g = setChipCounts(g, "a", [null, null, null, null, null]);
    expect(g.finalStacks.a).toBe("");
    expect(endCheck(g, nameOf).blockers).toContain("Enter Andhar's final stack (whole dollars, 0 is fine).");
    expect(setChipCounts(g, "a", [0, 0, 0, 0, 0]).finalStacks.a).toBe("0");
  });

  it("switching to a total keeps the stack and accepts typing; switching back refills from the counts", () => {
    let g = setChipCounts(fourAtThousand(), "a", [10, 10, 10, 5, 4]);
    g = setStackMode(g, "a", "total");
    expect(stackModeOf(g, "a")).toBe("total");
    expect(g.finalStacks.a).toBe("1000");
    g = setFinalStack(g, "a", "1,250");
    expect(g.finalStacks.a).toBe("1,250");
    g = setStackMode(g, "a", "chips");
    expect(g.finalStacks.a).toBe("1000");
  });

  it("a stack typed before chip mode (or in an older local game) stays a total", () => {
    const g = setFinalStack(fourAtThousand(), "a", "1500");
    expect(stackModeOf(g, "a")).toBe("total");
    expect(stackModeOf(g, "b")).toBe("chips");
  });

  it("counted stacks finish exactly like typed ones, the per-colour mismatch never blocks, and counts never reach the game", () => {
    // $1,200 + $800 + $1,000 + $1,000 = the $4,000 bought in, but 4 more blue and 2 fewer black than handed out.
    const counts = [
      [10, 10, 10, 5, 6],
      [10, 10, 10, 9, 0],
      [10, 10, 10, 5, 4],
      [10, 10, 10, 5, 4],
    ];
    let counted = fourAtThousand();
    let typed = fourAtThousand();
    ["a", "b", "c", "d"].forEach((p, i) => {
      counted = setChipCounts(counted, p, counts[i]!);
      typed = setFinalStack(typed, p, String(chipTotal(counts[i]!)));
    });
    expect(colorDifferences(countedPerColor(counts), replayBox(liveState(counted).buyIns).handedOut)).toEqual([
      { color: "blue", difference: 4 },
      { color: "black", difference: -2 },
    ]);
    expect(endCheck(counted, nameOf).ok).toBe(true);
    const entry = finishLocalGame(counted, nameOf);
    expect(entry).toEqual(finishLocalGame(typed, nameOf));
    expect(JSON.stringify(entry)).not.toMatch(/chipCounts|stackMode/);
  });

  it("round-trips through localStorage with and without the new fields; an old game finishes unchanged", () => {
    const store = new MemoryStore();
    const withCounts = setStackMode(setChipCounts(fourAtThousand(), "a", [10, null, 10, 5, 4]), "b", "total");
    saveLocalGame(withCounts, store);
    expect(loadLocalGame(store)).toEqual(withCounts);

    // A local game saved before step E: no chipCounts or stackMode at all.
    const old: LocalGame = { ...fourAtThousand(), finalStacks: { a: "1500", b: "500", c: "1000", d: "1000" } };
    expect("chipCounts" in old || "stackMode" in old).toBe(false);
    store.setItem("ct51.liveGame", JSON.stringify(old));
    const loaded = loadLocalGame(store)!;
    expect(loaded).toEqual(old);
    expect(["a", "b", "c", "d"].map((p) => stackModeOf(loaded, p))).toEqual(["total", "total", "total", "total"]);
    expect(finishLocalGame(loaded, nameOf)).toEqual(finishLocalGame(old, nameOf));
    expect(finishLocalGame(loaded, nameOf).game.cashOuts).toEqual([
      { player: "a", amount: 1500 },
      { player: "b", amount: 500 },
      { player: "c", amount: 1000 },
      { player: "d", amount: 1000 },
    ]);
  });
});
