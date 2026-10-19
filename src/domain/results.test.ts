import { describe, expect, it } from "vitest";
import { chipCheck, finalStack, gameResult, totalBuyIns } from "./results.js";
import type { Game } from "./types.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    seasonId: "s1",
    date: "2026-10-19",
    mode: "season",
    status: "finished",
    players: ["p1", "p2"],
    buyIns: [],
    cashOuts: [],
    createdAt: "2026-10-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("gameResult", () => {
  it("computes a single buy-in vs final stack", () => {
    const game = makeGame({
      buyIns: [{ player: "p1", amount: 1000, at: "t1" }],
      cashOuts: [{ player: "p1", amount: 1450 }],
    });
    expect(gameResult(game, "p1")).toBe(450);
  });

  it("computes a negative result", () => {
    const game = makeGame({
      buyIns: [{ player: "p1", amount: 1000, at: "t1" }],
      cashOuts: [{ player: "p1", amount: 700 }],
    });
    expect(gameResult(game, "p1")).toBe(-300);
  });

  it("sums multiple rebuys", () => {
    const game = makeGame({
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p1", amount: 1500, at: "t2" },
        { player: "p1", amount: 2000, at: "t3" },
      ],
      cashOuts: [{ player: "p1", amount: 5000 }],
    });
    expect(totalBuyIns(game, "p1")).toBe(4500);
    expect(gameResult(game, "p1")).toBe(500);
  });

  it("handles a custom (non-preset) buy-in amount", () => {
    const game = makeGame({
      buyIns: [{ player: "p1", amount: 1337, at: "t1" }],
      cashOuts: [{ player: "p1", amount: 1337 }],
    });
    expect(gameResult(game, "p1")).toBe(0);
  });

  it("handles a cash-out of exactly $0", () => {
    const game = makeGame({
      buyIns: [{ player: "p1", amount: 1000, at: "t1" }],
      cashOuts: [{ player: "p1", amount: 0 }],
    });
    expect(gameResult(game, "p1")).toBe(-1000);
    expect(finalStack(game, "p1")).toBe(0);
  });
});

describe("chipCheck", () => {
  it("passes when cash-outs equal buy-ins and everyone has a cash-out", () => {
    const game = makeGame({
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p2", amount: 1000, at: "t2" },
      ],
      cashOuts: [
        { player: "p1", amount: 1500 },
        { player: "p2", amount: 500 },
      ],
    });
    const result = chipCheck(game);
    expect(result.ok).toBe(true);
    expect(result.gap).toBe(0);
    expect(result.hint).toBeNull();
  });

  it("fails and reports a short gap", () => {
    const game = makeGame({
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p2", amount: 1500, at: "t2" },
      ],
      cashOuts: [
        { player: "p1", amount: 1000 },
        { player: "p2", amount: 1000 },
      ],
    });
    const result = chipCheck(game);
    expect(result.ok).toBe(false);
    expect(result.gap).toBe(-500);
  });

  it("fails and reports an over gap", () => {
    const game = makeGame({
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p2", amount: 1000, at: "t2" },
      ],
      cashOuts: [
        { player: "p1", amount: 1000 },
        { player: "p2", amount: 1500 },
      ],
    });
    const result = chipCheck(game);
    expect(result.ok).toBe(false);
    expect(result.gap).toBe(500);
  });

  it("hints when the gap matches a buy-in amount in the game", () => {
    const game = makeGame({
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p1", amount: 1500, at: "t2" },
        { player: "p2", amount: 1000, at: "t3" },
      ],
      cashOuts: [
        { player: "p1", amount: 1000 },
        { player: "p2", amount: 1000 },
      ],
    });
    const result = chipCheck(game);
    expect(result.ok).toBe(false);
    expect(result.gap).toBe(-1500);
    expect(result.hint).toBe("Same as one $1500 buy-in — missed rebuy?");
  });

  it("gives no hint when the gap matches no buy-in amount", () => {
    const game = makeGame({
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p2", amount: 1000, at: "t2" },
      ],
      cashOuts: [
        { player: "p1", amount: 1000 },
        { player: "p2", amount: 1777 },
      ],
    });
    const result = chipCheck(game);
    expect(result.hint).toBeNull();
  });

  it("fails if any player is missing a cash-out", () => {
    const game = makeGame({
      players: ["p1", "p2"],
      buyIns: [
        { player: "p1", amount: 1000, at: "t1" },
        { player: "p2", amount: 1000, at: "t2" },
      ],
      cashOuts: [{ player: "p1", amount: 2000 }],
    });
    const result = chipCheck(game);
    expect(result.ok).toBe(false);
  });
});
