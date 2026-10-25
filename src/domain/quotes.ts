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
    "Picture abhi baaki hai mere dost.",
    "Mogambo khush hua.",
    "Rishte mein toh hum tumhare baap lagte hain.",
    "Show me the money!",
    "Lai bhaari!",
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
    "It's not personal. It's strictly business.",
    "Hum jahan khade ho jaate hain, line wahi se shuru hoti hai.",
    "Ekdum kadak.",
    "An offer they couldn't refuse.",
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
    "All is well.",
    "Kitne aadmi the?",
    "Bade bade deshon mein aisi chhoti chhoti baatein hoti rehti hain.",
    "Kay chalu aahe?",
    "Why so serious?",
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
    "Houston, we have a problem.",
    "Utha le re baba.",
    "Ghabru naka.",
    "Thappad se darr nahi lagta, sahab… haar se lagta hai.",
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
    "Mere paas maa hai.",
    "25 din mein paisa double… bas thoda aur.",
    "The house always wins.",
    "Aai shapath, pudhcha game majha.",
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
    "Rahul, naam toh suna hoga.",
    "Main apni favourite hoon.",
    "Tension lene ka nahi, sirf dene ka.",
  ],

  // ---- situations (override the tier) ----
  heater: [
    "On a heater: {n} wins in a row.",
    "Somebody cool {name} down.",
    "Aag laga di.",
    "{n} straight. Nobody touch the deck.",
    "How's the josh? High, sir!",
    "Main jhukega nahi.",
    "Aata majhi satakli.",
  ],
  comeback: [
    "Rebought {r} times, walked out up. Respect.",
    "Down but never out.",
    "Left for dead, came back with chips.",
    "Haar ke jeetne wale ko baazigar kehte hain.",
  ],
  coldStreak: [
    "{n} rough nights in a row. It turns.",
    "Waqt badalta hai.",
    "The cards owe {name} one. Maybe two.",
    "Kabhi kabhi jeetne ke liye kuch haarna padta hai.",
    "Winter is coming.",
  ],
  rebuyKing: [
    "Rebuy royalty.",
    "Fortune favours the rebuy.",
    "Keeps the table funded. Bless.",
    "Pushpa, I hate tears.",
    "Paisa double karne ka scheme chalu hai.",
  ],
  backAfterBreak: [
    "Look who's back.",
    "The prodigal player returns.",
    "Missed you. Your chips didn't.",
    "I'll be back.",
    "Kahan the itne din?",
  ],
};

// The results card's line under the Man of the Match (separate from QUOTES and the daily pools).
export const WINNER_LINES: readonly string[] = [
  "Haar ke jeetne wale ko baazigar kehte hain.",
  "Mogambo khush hua.",
  "Picture abhi baaki hai mere dost.",
  "Aaj khush to bahut hoge tum.",
  "Paisa he paisa hoga.",
  "Winner winner, chicken dinner.",
  "Lay bhari!",
  "Ekdum kadak!",
];

// The same game always gets the same line: FNV-1a of its id.
export function winnerLine(gameId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < gameId.length; i++) hash = Math.imul(hash ^ gameId.charCodeAt(i), 0x01000193) >>> 0;
  return WINNER_LINES[hash % WINNER_LINES.length]!;
}
