import type { AwardKind, BadgeKind, FormMark, Situation, Tier } from "../domain/fun.js";
import { MAX_SEASON_GAMES } from "../config.js";
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

// The rule behind each tier (fun.ts `tier`), best first. "A typical buy-in" is the season's most common
// first buy-in (`typicalBuyIn`).
export const TIER_RULES: { tier: Tier; rule: string }[] = [
  { tier: "legend", rule: "Averaging at least +½ a typical buy-in per game." },
  { tier: "bond", rule: "Averaging at least +⅕ a typical buy-in per game." },
  { tier: "biscuit", rule: "Averaging within ⅕ of a typical buy-in of break-even per game." },
  { tier: "easyTiger", rule: "Averaging a loss of ⅕ to ½ a typical buy-in per game." },
  { tier: "atm", rule: "Averaging a loss of at least ½ a typical buy-in per game." },
  { tier: "freshBlood", rule: "Fewer than 3 season games this season, so no title yet." },
];

export const SITUATION_NAMES: Record<Situation, string> = {
  heater: "On a heater",
  comeback: "Comeback",
  coldStreak: "Cold streak",
  rebuyKing: "Rebuy king",
  backAfterBreak: "Back after a break",
};

// When each situation applies (fun.ts `situation`), in priority order: the first that applies is shown
// instead of the tier.
export const SITUATION_RULES: { situation: Situation; rule: string }[] = [
  { situation: "heater", rule: "Won the last 3 or more season games in a row." },
  { situation: "comeback", rule: "Rebought 2 or more times in their latest game and still finished up." },
  { situation: "coldStreak", rule: "Lost the last 3 or more season games in a row." },
  { situation: "rebuyKing", rule: "Most rebuys per game this season (3+ games, at least 1 rebuy a game). Ties share it." },
  { situation: "backAfterBreak", rule: "Played the season's latest game after 14 or more days away." },
];

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

// Unearned badges are listed in this order on the player page; the Hall of Fame lists them all in it.
export const BADGES: { kind: BadgeKind; name: string; icon: string; howToEarn: string }[] = [
  { kind: "firstBlood", name: "First blood", icon: "🩸", howToEarn: "Win a season game." },
  { kind: "hatTrick", name: "Hat trick", icon: "🎩", howToEarn: "Win 3 season games in a row." },
  { kind: "doubleUp", name: "Double up", icon: "💰", howToEarn: "Finish a game with at least double what you bought in." },
  { kind: "phoenix", name: "Phoenix", icon: "🔥", howToEarn: "Rebuy 3+ times in a game and still finish up." },
  { kind: "tenClub", name: "Ten club", icon: "🔟", howToEarn: "Play 10 season games." },
  { kind: "halfCentury", name: "Half century", icon: "🏏", howToEarn: "Play 50 season games." },
  { kind: "champion", name: "Season champion", icon: "🏆", howToEarn: "Finish #1 when a season closes." },
  { kind: "podium", name: "Podium", icon: "🏅", howToEarn: "Finish in the top 3 when a season closes." },
  { kind: "woodenSpoon", name: "Wooden spoon", icon: "🥄", howToEarn: "Finish last when a season closes." },
  { kind: "wireToWire", name: "Wire to wire", icon: "🏁", howToEarn: "Be #1 in the standings after every game of a closed season (5+ games)." },
  { kind: "perfectAttendance", name: "Perfect attendance", icon: "📅", howToEarn: `Play every game of a closed season (${MAX_SEASON_GAMES}+ games).` },
  { kind: "manOfTheMatch", name: "Man of the Match ×5", icon: "🌟", howToEarn: "Be the night's biggest winner 5 times (ties count for everyone tied)." },
  { kind: "luckySeven", name: "Lucky seven", icon: "🍀", howToEarn: "Win 7 season games." },
  { kind: "doubleDigits", name: "Double digits", icon: "🔢", howToEarn: "Win 10 season games." },
  { kind: "tripleThreat", name: "Triple threat", icon: "🚀", howToEarn: "Finish a game with at least triple what you bought in." },
  { kind: "whale", name: "Whale", icon: "🐋", howToEarn: "Win $2,000 or more in one game." },
  { kind: "loneWolf", name: "Lone wolf", icon: "🐺", howToEarn: "Be the only player who finished up, in a game of 3 or more." },
  { kind: "giantSlayer", name: "Giant slayer", icon: "⚔️", howToEarn: "Win a game where the season leader going in finished down." },
  { kind: "bounceBack", name: "Bounce back", icon: "🏀", howToEarn: "Win the night right after a season game where you lost at least half a typical buy-in." },
  { kind: "secondWind", name: "Second wind", icon: "💨", howToEarn: "Rebuy at least once in a game and still finish up." },
  { kind: "evenSteven", name: "Even Steven", icon: "⚖️", howToEarn: "Finish a game at exactly $0." },
  { kind: "felted", name: "Felted", icon: "🕳️", howToEarn: "Cash out $0 in a game." },
];

// "Season champion ×2": the count shows once a badge is earned more than once.
export function badgeTitle(name: string, count: number): string {
  return count > 1 ? `${name} ×${count}` : name;
}

export const FORM_WORDS: Record<FormMark, string> = { W: "won", L: "lost", E: "even" };

// "Last 3 games, oldest first: won, lost, even"
export function formLabel(form: FormMark[]): string {
  return `Last ${plural(form.length, "game")}, oldest first: ${form.map((m) => FORM_WORDS[m]).join(", ")}`;
}
