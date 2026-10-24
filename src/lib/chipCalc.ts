import { formatDollars } from "./format.js";
import type { ChipSplit } from "../domain/chips.js";
import type { KeyValueStore } from "../storage/localKeys.js";

// Chip calculator screen helpers (#/chips): messages for impossible splits, the custom buy-in field and
// the last players/buy-in remembered per device. The split itself is domain/chips.ts.

export const CHIP_CALC_KEY = "ct51.chipCalc";
export const CHIP_CALC_PRESETS = [1000, 1500, 2000] as const;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
const MAX_BUY_IN = 10_000_000; // the schema's buy-in limit (§6.2)

export interface ChipCalcChoice {
  players: number;
  buyIn: number;
}

export const DEFAULT_CHIP_CALC: ChipCalcChoice = { players: 4, buyIn: 1000 };

export function chipSplitMessage(split: Extract<ChipSplit, { ok: false }>): string {
  switch (split.reason) {
    case "notPositive":
      return "Enter a buy-in above $0.";
    case "badPlayers":
      return "Pick how many players.";
    case "notMultiple":
      return `Buy-ins must be a multiple of ${formatDollars(split.step)}.`;
    case "overBox":
      return `${split.players} × ${formatDollars(split.amount)} = ${formatDollars(split.players * split.amount)} is more than the box holds (${formatDollars(split.boxValue)}).`;
    case "notEnough":
      return `Not enough chips for ${split.players} players: the most each can get is ${formatDollars(split.maxPerPlayer)}.`;
  }
}

// The custom buy-in field: digits, optionally with "$" and thousands separators.
export function parseBuyIn(text: string): { amount: number } | { error: string } {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (cleaned === "") return { error: "Enter a buy-in." };
  if (!/^\d+$/.test(cleaned)) return { error: "Whole dollars only." };
  const amount = Number(cleaned);
  if (amount <= 0) return { error: "Enter a buy-in above $0." };
  if (amount > MAX_BUY_IN) return { error: `At most ${formatDollars(MAX_BUY_IN)}.` };
  if (amount % 5 !== 0) return { error: "Use a multiple of $5." };
  return { amount };
}

export function readChipCalc(store: Pick<KeyValueStore, "getItem"> | null): ChipCalcChoice {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(CHIP_CALC_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_CHIP_CALC;
    const { players, buyIn } = parsed as Record<string, unknown>;
    const validPlayers = typeof players === "number" && Number.isInteger(players) && players >= MIN_PLAYERS && players <= MAX_PLAYERS;
    const validBuyIn = typeof buyIn === "number" && "amount" in parseBuyIn(String(buyIn));
    return {
      players: validPlayers ? players : DEFAULT_CHIP_CALC.players,
      buyIn: validBuyIn ? buyIn : DEFAULT_CHIP_CALC.buyIn,
    };
  } catch {
    return DEFAULT_CHIP_CALC; // storage blocked or not JSON
  }
}

export function saveChipCalc(store: Pick<KeyValueStore, "setItem"> | null, choice: ChipCalcChoice): void {
  try {
    store?.setItem(CHIP_CALC_KEY, JSON.stringify({ players: choice.players, buyIn: choice.buyIn }));
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
}
