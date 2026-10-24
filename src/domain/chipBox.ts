import { CHIP_SET, PREFERRED_SPLITS } from "../config.js";
import { chipSplit, type ChipDenomination, type ChipSplit } from "./chips.js";
import type { BuyIn, ID } from "./types.js";

// Chips in a live game (Table tools step E). Derived, never stored: the game's buy-ins are replayed in
// order, each one split for one player against what is left in the box (chipSplit), so undo, late and
// removed players need nothing special. A buy-in the box can't make hands out nothing ("not tracked")
// and leaves the box as it was. Only hints come from this: the strict chip check (§5.6) is on dollars.

export interface BoxStep {
  buyIn: BuyIn;
  split: number[] | null; // chips of each colour handed out, in the chip set's order; null = not tracked
  failure: Extract<ChipSplit, { ok: false }>["reason"] | null;
}

export interface BoxReplay {
  steps: BoxStep[];
  handedOut: number[]; // per colour, over every tracked buy-in
  left: number[]; // per colour, still in the box
}

// Splits are cached by amount and box contents: replaying a long game then costs one new split per buy-in.
const cache = new Map<string, ChipSplit>();
const MAX_CACHE = 500;

function splitFromBox(amount: number, box: readonly ChipDenomination[], preferred: Readonly<Record<number, readonly number[]>>): ChipSplit {
  const usesDefaults = preferred === PREFERRED_SPLITS;
  const key = `${amount}|${box.map((c) => `${c.value}:${c.count}`).join(",")}`;
  const hit = usesDefaults ? cache.get(key) : undefined;
  if (hit) return hit;
  const split = chipSplit(amount, 1, box, preferred);
  if (usesDefaults) {
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, split);
  }
  return split;
}

export function replayBox(
  buyIns: readonly BuyIn[],
  chips: readonly ChipDenomination[] = CHIP_SET,
  preferred: Readonly<Record<number, readonly number[]>> = PREFERRED_SPLITS,
): BoxReplay {
  const left = chips.map((c) => c.count);
  const handedOut = chips.map(() => 0);
  const steps: BoxStep[] = [];
  for (const buyIn of buyIns) {
    const box = chips.map((c, i) => ({ ...c, count: left[i]! }));
    const split = splitFromBox(buyIn.amount, box, preferred);
    if (split.ok) {
      split.perPlayer.forEach((n, i) => {
        left[i]! -= n;
        handedOut[i]! += n;
      });
      steps.push({ buyIn, split: [...split.perPlayer], failure: null });
    } else {
      steps.push({ buyIn, split: null, failure: split.reason });
    }
  }
  return { steps, handedOut, left };
}

// Chips counted per colour over every player's counts (blank, negative or fractional counts are 0).
export function countedPerColor(counts: readonly (readonly number[])[], chips: readonly ChipDenomination[] = CHIP_SET): number[] {
  return chips.map((_, i) =>
    counts.reduce((sum, c) => {
      const n = c[i] ?? 0;
      return sum + (Number.isInteger(n) && n > 0 ? n : 0);
    }, 0),
  );
}

export interface ColorDifference {
  color: ChipDenomination["color"];
  difference: number; // counted − handed out
}

export function colorDifferences(
  counted: readonly number[],
  handedOut: readonly number[],
  chips: readonly ChipDenomination[] = CHIP_SET,
): ColorDifference[] {
  return chips.flatMap((c, i) => {
    const difference = (counted[i] ?? 0) - (handedOut[i] ?? 0);
    return difference === 0 ? [] : [{ color: c.color, difference }];
  });
}

export function untrackedBuyIns(replay: BoxReplay): { player: ID; amount: number }[] {
  return replay.steps.filter((s) => s.split === null).map((s) => ({ player: s.buyIn.player, amount: s.buyIn.amount }));
}
