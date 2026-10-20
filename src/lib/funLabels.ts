import type { AwardKind, BadgeKind, FormMark, Situation, Tier } from "../domain/fun.js";
import { formatDollars, formatSignedDollars } from "./format.js";

// Display names and one-line descriptions for the stats engine (domain/fun.ts). Text only, no logic.

export const TIER_NAMES: Record<Tier, string> = {
  legend: "Legend",
  bond: "The Bond",
  biscuit: "Biscuit",
  easyTiger: "Easy tiger",
  atm: "The ATM",
  freshBlood: "Fresh blood",
};

export const SITUATION_NAMES: Record<Situation, string> = {
  heater: "On a heater",
  comeback: "Comeback",
  coldStreak: "Cold streak",
  rebuyKing: "Rebuy king",
  backAfterBreak: "Back after a break",
};

// Listed in this order on the season and player pages.
export const AWARDS: { kind: AwardKind; name: string; description: string }[] = [
  { kind: "shark", name: "The Shark", description: "Best average per game (3+ games)." },
  { kind: "atm", name: "Rebuy Machine", description: "Most rebuys this season." },
  { kind: "rock", name: "The Rock", description: "Fewest rebuys per game (3+ games)." },
  { kind: "comebackKid", name: "Comeback Kid", description: "Most nights won after 2+ rebuys." },
  { kind: "bigNight", name: "Big Night", description: "Biggest single-night win." },
  { kind: "rollercoaster", name: "Rollercoaster", description: "Wildest swings from night to night (3+ games)." },
  { kind: "ironMan", name: "Iron Man", description: "Most games played." },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

// The number behind each award, as shown next to the holder.
export function awardValue(kind: AwardKind, value: number): string {
  switch (kind) {
    case "shark":
      return `${formatSignedDollars(Math.round(value))} a game`;
    case "atm":
      return plural(value, "rebuy");
    case "rock":
      return `${oneDecimal(value)} rebuys a game`;
    case "comebackKid":
      return plural(value, "comeback");
    case "bigNight":
      return formatSignedDollars(value);
    case "rollercoaster":
      return `swings of ±${formatDollars(value)}`;
    case "ironMan":
      return plural(value, "game");
  }
}

// Listed in this order on the player page.
export const BADGES: { kind: BadgeKind; name: string; howToEarn: string }[] = [
  { kind: "firstBlood", name: "First blood", howToEarn: "Win a season game." },
  { kind: "hatTrick", name: "Hat trick", howToEarn: "Win 3 season games in a row." },
  { kind: "doubleUp", name: "Double up", howToEarn: "Finish a game with at least double what you bought in." },
  { kind: "phoenix", name: "Phoenix", howToEarn: "Rebuy 3+ times in a game and still finish up." },
  { kind: "tenClub", name: "Ten club", howToEarn: "Play 10 season games." },
  { kind: "halfCentury", name: "Half century", howToEarn: "Play 50 season games." },
];

export const FORM_WORDS: Record<FormMark, string> = { W: "won", L: "lost", E: "even" };

// "Last 3 games, oldest first: won, lost, even"
export function formLabel(form: FormMark[]): string {
  return `Last ${plural(form.length, "game")}, oldest first: ${form.map((m) => FORM_WORDS[m]).join(", ")}`;
}
