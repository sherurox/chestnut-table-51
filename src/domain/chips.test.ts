import { describe, expect, it } from "vitest";
import { CHIP_SET, PREFERRED_SPLITS } from "../config.js";
import { boxValue, chipSplit, chipTotal, type ChipDenomination } from "./chips.js";

const value = (split: readonly number[], chips: readonly ChipDenomination[] = CHIP_SET) =>
  split.reduce((sum, n, i) => sum + n * chips[i]!.value, 0);

function ok(amount: number, players: number) {
  const result = chipSplit(amount, players);
  if (!result.ok) throw new Error(`${players} × $${amount} failed: ${result.reason}`);
  return result;
}

describe("chip set", () => {
  it("holds $9,500 and the preferred $1,000 split adds up", () => {
    expect(boxValue(CHIP_SET)).toBe(9500);
    expect(value(PREFERRED_SPLITS[1000]!)).toBe(1000);
  });
});

describe("chipSplit", () => {
  it("uses the preferred $1,000 split exactly for 4 and 5 players", () => {
    for (const players of [2, 4, 5]) {
      expect(ok(1000, players).perPlayer).toEqual([10, 10, 10, 5, 4]);
    }
  });

  it("finds another exact split for $1,000 × 6 (red and green would overflow)", () => {
    const split = ok(1000, 6);
    expect(split.perPlayer).not.toEqual([10, 10, 10, 5, 4]);
    expect(split.perPlayer).toEqual([12, 8, 8, 6, 4]);
    expect(value(split.perPlayer)).toBe(1000);
    split.perPlayer.forEach((n, i) => expect(n * 6).toBeLessThanOrEqual(CHIP_SET[i]!.count));
  });

  it("fits $1,500 for 4–6 players and $2,000 for 4", () => {
    expect(ok(1500, 4).perPlayer).toEqual([18, 12, 12, 7, 7]);
    expect(ok(1500, 5).perPlayer).toEqual([14, 10, 9, 9, 7]);
    expect(ok(1500, 6).perPlayer).toEqual([12, 8, 8, 8, 8]);
    expect(ok(2000, 4).perPlayer).toEqual([18, 12, 12, 11, 10]);
  });

  it("reports per-player totals and what's left in the box", () => {
    const split = ok(1000, 4);
    expect(split.chipsPerPlayer).toBe(39);
    expect(split.valuePerPlayer).toBe(1000);
    expect(split.leftInBox).toEqual([60, 10, 10, 30, 34]);
    expect(split.boxValue).toBe(9500);
  });

  it("rejects $2,000 for 5 or 6 players: more than the box holds", () => {
    for (const players of [5, 6]) {
      expect(chipSplit(2000, players)).toMatchObject({ ok: false, reason: "overBox", boxValue: 9500 });
    }
  });

  it("rejects 10 × $1,000 (over the box value)", () => {
    expect(chipSplit(1000, 10)).toMatchObject({ ok: false, reason: "overBox" });
  });

  it("rejects amounts that aren't a multiple of $5", () => {
    expect(chipSplit(1003, 4)).toMatchObject({ ok: false, reason: "notMultiple", step: 5 });
    expect(chipSplit(1, 2)).toMatchObject({ ok: false, reason: "notMultiple" });
  });

  it("rejects amounts that aren't whole dollars above $0, and invalid player counts", () => {
    for (const amount of [0, -5, 12.5, Number.NaN]) {
      expect(chipSplit(amount, 4)).toMatchObject({ ok: false, reason: "notPositive" });
    }
    for (const players of [0, -1, 2.5]) {
      expect(chipSplit(1000, players)).toMatchObject({ ok: false, reason: "badPlayers" });
    }
  });

  it("says when the chips can't make it even within the box value, with the most per player", () => {
    // 9 × $1,000 = $9,000 fits the box value, but 9 players get at most 11 white + 5 of each other.
    expect(chipSplit(1000, 9)).toMatchObject({ ok: false, reason: "notEnough", maxPerPlayer: 955 });
    expect(chipSplit(955, 9).ok).toBe(true);
  });

  it("keeps small buy-ins in small chips", () => {
    expect(ok(100, 4).perPlayer).toEqual([2, 2, 1, 1, 0]);
    expect(ok(5, 12).perPlayer).toEqual([1, 0, 0, 0, 0]);
  });

  it("every split adds up exactly and never needs more chips than the box has", () => {
    let checked = 0;
    for (let players = 2; players <= 12; players++) {
      for (let amount = 5; amount * players <= 9500; amount += amount < 500 ? 5 : 35) {
        const result = chipSplit(amount, players);
        if (!result.ok) {
          expect(result.reason).toBe("notEnough");
          expect(amount).toBeGreaterThan(result.maxPerPlayer);
          continue;
        }
        checked++;
        expect(value(result.perPlayer)).toBe(amount);
        result.perPlayer.forEach((n, i) => {
          expect(Number.isInteger(n) && n >= 0).toBe(true);
          expect(n * players).toBeLessThanOrEqual(CHIP_SET[i]!.count);
        });
        expect(result.leftInBox.every((n) => n >= 0)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("is deterministic", () => {
    for (const [amount, players] of [[1000, 6], [1500, 5], [735, 3], [2000, 4]] as const) {
      expect(chipSplit(amount, players)).toEqual(chipSplit(amount, players));
    }
  });

  it("works for another chip set, with or without a preferred split", () => {
    const chips: ChipDenomination[] = [
      { color: "white", value: 25, count: 20 },
      { color: "black", value: 100, count: 20 },
    ];
    const withPreferred = chipSplit(500, 2, chips, { 500: [4, 4] });
    expect(withPreferred).toMatchObject({ ok: true, perPlayer: [4, 4] });
    const even = chipSplit(500, 2, chips, {});
    expect(even).toMatchObject({ ok: true, perPlayer: [4, 4] });
    expect(chipSplit(510, 2, chips, {})).toMatchObject({ ok: false, reason: "notMultiple", step: 25 });
  });

  it("ignores a preferred split that doesn't fit and fits the shape instead", () => {
    // 6 × 10 red is more than the 50 in the box: the search takes over.
    expect(ok(1000, 6).perPlayer).not.toEqual(PREFERRED_SPLITS[1000]);
  });
});

describe("chipTotal", () => {
  it("adds up a counted stack", () => {
    expect(chipTotal([10, 10, 10, 5, 4])).toBe(1000);
    expect(chipTotal([1, 1, 1, 1, 1])).toBe(185);
    expect(chipTotal([100, 50, 50, 50, 50])).toBe(9500);
    expect(chipTotal([])).toBe(0);
  });

  it("treats blank, negative and fractional counts as 0", () => {
    expect(chipTotal([3, -2, 1.5, Number.NaN, 1])).toBe(115);
  });
});
