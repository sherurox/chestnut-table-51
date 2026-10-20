import type { QuotePool } from "./fun.js";

// Daily one-liners, one pool per tier and per situation (fun.ts picks the pool and the line).
// Placeholders: {name} = player name, {n} = current streak length, {r} = rebuys.
// Edit freely; every pool needs at least one line.
export const QUOTES: Record<QuotePool, readonly string[]> = {
  // ---- tiers ----
  legend: [
    "Bond. James Bond, of poker.",
    "Shaken, not stirred. Definitely not broke.",
    "The table pays rent to this one.",
    "Somebody check his sleeves.",
    "Chips see {name} and just walk over.",
    "Raja of the table, aur kya.",
    "Not luck. Okay, maybe a little luck.",
    "Save some chips for the rest of us.",
  ],
  bond: [
    "Quietly stacking. Very suspicious.",
    "Winning, but humble about it. For now.",
    "Steady climb, no drama.",
    "Ek dum smooth operator.",
    "Good reads, better timing.",
    "Calm face, full stack.",
    "The player your chips warn you about.",
    "Up and up. Keep it that way.",
  ],
  biscuit: [
    "Maybe you need to risk it for the biscuit.",
    "Breaking even like it's a job.",
    "Not winning, not losing, just vibing.",
    "Bhai, thoda risk bhi le lo.",
    "Safe play. Too safe? Discuss.",
    "One big night away from glory.",
    "Folding is not a personality.",
    "The table barely notices you. Change that.",
  ],
  easyTiger: [
    "Maybe a little less risk next time.",
    "Bold moves. Mixed results.",
    "The chips are on a long vacation.",
    "Thoda sambhal ke, boss.",
    "All-in is a strategy, not a lifestyle.",
    "Generous with the table, as always.",
    "Comeback season starts next game. Right?",
    "Rough patch. Tables turn.",
  ],
  atm: [
    "The table's favourite ATM.",
    "Bank of {name}: open 24/7.",
    "Sponsoring everyone's season, one rebuy at a time.",
    "Paisa he paisa hoga… just not yours.",
    "The rebuy button is wearing out.",
    "Respect the dedication. Not the results.",
    "Every legend needs an origin story. This is yours.",
    "Kal se pakka better. Pakka.",
  ],
  freshBlood: [
    "Too early to judge. We're judging anyway.",
    "New at the table. Fresh chips, big dreams.",
    "Still reading the room.",
    "Welcome. Your chips will be missed.",
    "Shuru shuru mein sab aise hi hote hain.",
    "The jury's still out.",
    "First few hands. No pressure. Okay, some pressure.",
    "Learning the table. The table is learning you too.",
  ],

  // ---- situations (override the tier) ----
  heater: [
    "On a heater: {n} wins in a row.",
    "Somebody cool {name} down.",
    "Aag laga di.",
    "{n} straight. Nobody touch the deck.",
  ],
  comeback: [
    "Rebought {r} times, walked out up. Respect.",
    "Down but never out.",
    "Left for dead, came back with chips.",
  ],
  coldStreak: [
    "{n} rough nights in a row. It turns.",
    "Waqt badalta hai.",
    "The cards owe {name} one. Maybe two.",
  ],
  rebuyKing: [
    "Rebuy royalty.",
    "Fortune favours the rebuy.",
    "Keeps the table funded. Bless.",
  ],
  backAfterBreak: [
    "Look who's back.",
    "The prodigal player returns.",
    "Missed you. Your chips didn't.",
  ],
};
