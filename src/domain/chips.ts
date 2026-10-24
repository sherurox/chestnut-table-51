import { CHIP_SET, PREFERRED_SPLITS, type ChipColor } from "../config.js";

// Chip calculator (Table tools step C): one split of a buy-in into chips that every player at the table
// gets, and the value of a counted stack. Pure: the chip box and preferred splits are passed in (the
// defaults come from src/config.ts). Nothing here touches data.json.

export interface ChipDenomination {
  color: ChipColor;
  value: number;
  count: number; // chips of this colour in the box
}

export type ChipSplit =
  | {
      ok: true;
      perPlayer: number[]; // chips of each colour per player, in the chip set's order
      chipsPerPlayer: number;
      valuePerPlayer: number;
      leftInBox: number[]; // per colour, after every player got their split
      boxValue: number;
    }
  | {
      ok: false;
      // notPositive: amount isn't a whole number above $0; badPlayers: players isn't a whole number ≥ 1;
      // notMultiple: amount isn't a multiple of `step`; overBox: players × amount > boxValue;
      // notEnough: within the box value, but the chips can't make the amount for everyone.
      reason: "notPositive" | "badPlayers" | "notMultiple" | "overBox" | "notEnough";
      amount: number;
      players: number;
      step: number;
      boxValue: number;
      maxPerPlayer: number; // the most each player can get with whole chips (0 when players is invalid)
    };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function boxValue(chips: readonly ChipDenomination[]): number {
  return chips.reduce((sum, c) => sum + c.value * c.count, 0);
}

// The total value of a stack from per-colour counts (the chip counter). Blank, negative or fractional
// counts count as 0.
export function chipTotal(counts: readonly number[], chips: readonly ChipDenomination[] = CHIP_SET): number {
  return chips.reduce((sum, c, i) => {
    const n = counts[i] ?? 0;
    return sum + (Number.isInteger(n) && n > 0 ? n * c.value : 0);
  }, 0);
}

export function chipSplit(
  amount: number,
  players: number,
  chips: readonly ChipDenomination[] = CHIP_SET,
  preferred: Readonly<Record<number, readonly number[]>> = PREFERRED_SPLITS,
): ChipSplit {
  const step = chips.reduce((g, c) => gcd(g, c.value), 0);
  const box = boxValue(chips);
  const validPlayers = Number.isInteger(players) && players >= 1;
  const caps = chips.map((c) => (validPlayers ? Math.floor(c.count / players) : 0));
  const maxPerPlayer = chips.reduce((sum, c, i) => sum + caps[i]! * c.value, 0);
  const fail = (reason: Extract<ChipSplit, { ok: false }>["reason"]): ChipSplit => ({
    ok: false,
    reason,
    amount,
    players,
    step,
    boxValue: box,
    maxPerPlayer,
  });

  if (!Number.isInteger(amount) || amount <= 0) return fail("notPositive");
  if (!validPlayers) return fail("badPlayers");
  if (amount % step !== 0) return fail("notMultiple");
  if (amount * players > box) return fail("overBox");

  const exact = preferred[amount];
  const fits = (split: readonly number[]) =>
    split.length === chips.length &&
    split.every((n, i) => Number.isInteger(n) && n >= 0 && n <= caps[i]!) &&
    split.reduce((sum, n, i) => sum + n * chips[i]!.value, 0) === amount;
  const split = exact && fits(exact) ? [...exact] : closestSplit(amount, chips, caps, preferred);
  if (!split) return fail("notEnough");

  return {
    ok: true,
    perPlayer: split,
    chipsPerPlayer: split.reduce((sum, n) => sum + n, 0),
    valuePerPlayer: amount,
    leftInBox: chips.map((c, i) => c.count - split[i]! * players),
    boxValue: box,
  };
}

// The exact split (within `caps` per colour) closest to the nearest preferred split scaled to the amount:
// smallest sum of squared differences in chip counts. Scaling keeps small buy-ins mostly in small chips.
// Ties go to more of the smallest chip, then the next colour up. Exhaustive over every colour but the
// smallest, which makes up the rest; bounded because players × amount ≤ the box value.
function closestSplit(
  amount: number,
  chips: readonly ChipDenomination[],
  caps: readonly number[],
  preferred: Readonly<Record<number, readonly number[]>>,
): number[] | null {
  // Colour indexes from the smallest chip up (the chip set is normally already in this order).
  const order = chips.map((_, i) => i).sort((a, b) => chips[a]!.value - chips[b]!.value || a - b);
  const [fill, ...rest] = order;
  if (fill === undefined) return null;

  // Target counts are pref × amount / base; distances are scaled by base² so they stay whole numbers.
  const base = nearestPreferred(amount, chips.length, preferred);
  // Without a preferred split, aim for equal counts: one of each chip is worth the sum of the values.
  const pref = base === null ? chips.map(() => 1) : preferred[base]!;
  const scale = base ?? chips.reduce((sum, c) => sum + c.value, 0);
  const distance = (counts: readonly number[]) =>
    counts.reduce((sum, n, i) => sum + (n * scale - pref[i]! * amount) ** 2, 0);

  let best: number[] | null = null;
  let bestDistance = Infinity;
  const counts = chips.map(() => 0);
  const consider = () => {
    const d = distance(counts);
    if (d < bestDistance || (d === bestDistance && best !== null && moreSmallChips(counts, best, order))) {
      best = [...counts];
      bestDistance = d;
    }
  };

  // Largest chips first, so pruning on the remaining amount cuts early.
  const others = [...rest].reverse();
  const search = (k: number, remaining: number) => {
    if (k === others.length) {
      const value = chips[fill]!.value;
      if (remaining % value !== 0 || remaining / value > caps[fill]!) return;
      counts[fill] = remaining / value;
      consider();
      return;
    }
    const i = others[k]!;
    const value = chips[i]!.value;
    const most = Math.min(caps[i]!, Math.floor(remaining / value));
    for (let n = 0; n <= most; n++) {
      counts[i] = n;
      search(k + 1, remaining - n * value);
    }
    counts[i] = 0;
  };
  search(0, amount);
  return best;
}

// The preferred split's amount nearest to `amount` (ties: the smaller), ignoring malformed entries.
function nearestPreferred(amount: number, colors: number, preferred: Readonly<Record<number, readonly number[]>>): number | null {
  let best: number | null = null;
  for (const key of Object.keys(preferred).map(Number)) {
    const split = preferred[key]!;
    if (!(key > 0) || split.length !== colors || split.some((n) => !(n >= 0))) continue;
    if (best === null || Math.abs(key - amount) < Math.abs(best - amount) || (Math.abs(key - amount) === Math.abs(best - amount) && key < best)) {
      best = key;
    }
  }
  return best;
}

function moreSmallChips(a: readonly number[], b: readonly number[], order: readonly number[]): boolean {
  for (const i of order) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}
