import { describe, expect, it } from "vitest";
import { chipSplit, type ChipSplit } from "../domain/chips.js";
import { CHIP_CALC_KEY, chipSplitMessage, DEFAULT_CHIP_CALC, parseBuyIn, readChipCalc, saveChipCalc } from "./chipCalc.js";

const failure = (amount: number, players: number) => {
  const result = chipSplit(amount, players);
  if (result.ok) throw new Error("expected a failure");
  return result as Extract<ChipSplit, { ok: false }>;
};

describe("chipSplitMessage", () => {
  it("explains each impossible case", () => {
    expect(chipSplitMessage(failure(1000, 10))).toBe("10 × $1,000 = $10,000 is more than the box holds ($9,500).");
    expect(chipSplitMessage(failure(2000, 5))).toBe("5 × $2,000 = $10,000 is more than the box holds ($9,500).");
    expect(chipSplitMessage(failure(1000, 9))).toBe("Not enough chips for 9 players: the most each can get is $955.");
    expect(chipSplitMessage(failure(1003, 4))).toBe("Buy-ins must be a multiple of $5.");
    expect(chipSplitMessage(failure(0, 4))).toBe("Enter a buy-in above $0.");
  });
});

describe("parseBuyIn", () => {
  it("accepts whole multiples of $5, with $ and separators", () => {
    expect(parseBuyIn("1250")).toEqual({ amount: 1250 });
    expect(parseBuyIn(" $1,250 ")).toEqual({ amount: 1250 });
  });

  it("explains what's wrong otherwise", () => {
    expect(parseBuyIn("")).toEqual({ error: "Enter a buy-in." });
    expect(parseBuyIn("1003")).toEqual({ error: "Use a multiple of $5." });
    expect(parseBuyIn("12.5")).toEqual({ error: "Whole dollars only." });
    expect(parseBuyIn("-5")).toEqual({ error: "Whole dollars only." });
    expect(parseBuyIn("0")).toEqual({ error: "Enter a buy-in above $0." });
    expect(parseBuyIn("99999999")).toEqual({ error: "At most $10,000,000." });
  });
});

describe("remembered players and buy-in", () => {
  const store = (value: string | null) => ({ getItem: (key: string) => (key === CHIP_CALC_KEY ? value : null) });

  it("defaults to 4 players and $1,000", () => {
    expect(readChipCalc(null)).toEqual(DEFAULT_CHIP_CALC);
    expect(readChipCalc(store(null))).toEqual({ players: 4, buyIn: 1000 });
    expect(readChipCalc(store("not json"))).toEqual(DEFAULT_CHIP_CALC);
    expect(readChipCalc(store("[1,2]"))).toEqual(DEFAULT_CHIP_CALC);
  });

  it("reads a saved choice and drops invalid parts", () => {
    expect(readChipCalc(store('{"players":6,"buyIn":1250}'))).toEqual({ players: 6, buyIn: 1250 });
    expect(readChipCalc(store('{"players":13,"buyIn":1003}'))).toEqual(DEFAULT_CHIP_CALC);
    expect(readChipCalc(store('{"players":1,"buyIn":"1500"}'))).toEqual(DEFAULT_CHIP_CALC);
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      },
    };
    expect(readChipCalc(blocked)).toEqual(DEFAULT_CHIP_CALC);
    expect(() => saveChipCalc(blocked, { players: 5, buyIn: 1500 })).not.toThrow();
  });

  it("saves under ct51.chipCalc and reads it back", () => {
    const saved = new Map<string, string>();
    saveChipCalc({ setItem: (k, v) => void saved.set(k, v) }, { players: 5, buyIn: 1500 });
    expect(saved.get("ct51.chipCalc")).toBe('{"players":5,"buyIn":1500}');
    expect(readChipCalc({ getItem: (k) => saved.get(k) ?? null })).toEqual({ players: 5, buyIn: 1500 });
  });
});
