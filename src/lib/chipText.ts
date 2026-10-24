import { CHIP_SET } from "../config.js";
import type { ChipDenomination, ChipSplit } from "../domain/chips.js";
import type { ColorDifference } from "../domain/chipBox.js";
import { formatDollars } from "./format.js";

// Words for chips in a live game (Table tools step E). The numbers come from domain/chipBox.ts.

// "10 white · 10 red · 5 blue": colours with none are left out ("none" if nothing at all).
export function chipList(counts: readonly number[], chips: readonly ChipDenomination[] = CHIP_SET): string {
  const parts = chips.flatMap((c, i) => ((counts[i] ?? 0) > 0 ? [`${counts[i]} ${c.color}`] : []));
  return parts.length > 0 ? parts.join(" · ") : "none";
}

// The box line keeps empty colours, so a colour that ran out shows as 0.
export function boxLine(left: readonly number[], chips: readonly ChipDenomination[] = CHIP_SET): string {
  return `Box: ${chips.map((c, i) => `${left[i] ?? 0} ${c.color}`).join(" · ")}`;
}

export function suggestionText(name: string, split: readonly number[]): string {
  return `Give ${name}: ${chipList(split)}`;
}

export function boxCantMakeText(amount: number, reason: Extract<ChipSplit, { ok: false }>["reason"]): string {
  if (reason === "notMultiple") return `The chips can't make ${formatDollars(amount)} exactly; hand out what you can and note it`;
  return `The box can't make ${formatDollars(amount)} from what's left; hand out what you can and note it`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function colorDifferenceText(d: ColorDifference): string {
  const n = Math.abs(d.difference);
  return `${capital(d.color)}: ${n} ${d.difference > 0 ? "more" : "fewer"} counted than handed out`;
}

export interface ColorHint {
  lines: string[]; // one per colour that differs, then one per buy-in the box couldn't make
  matches: boolean;
}

export function colorHint(
  differences: readonly ColorDifference[],
  untracked: readonly { player: string; amount: number }[],
  nameOf: (id: string) => string,
): ColorHint {
  const lines = [
    ...differences.map(colorDifferenceText),
    ...untracked.map((u) => `Box couldn't make ${formatDollars(u.amount)} for ${nameOf(u.player)}`),
  ];
  return { lines, matches: differences.length === 0 && untracked.length === 0 };
}

export const COLOR_HINT_NOTE = "Swapping chips with the box for change can cause this. Only the chip check above has to pass.";
export const COLOR_HINT_MATCH = "Every colour matches what was handed out.";
export const COLOR_HINT_NEEDS_COUNTS = "Count every player by colour to compare with what was handed out.";

