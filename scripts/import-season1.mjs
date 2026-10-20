#!/usr/bin/env node
// One-time import of the real Season 1 history (Oct 15–19, 2026), played before the app was in use.
// Owner-approved, scripted exception to "never edit data.json by hand" (CLAUDE.md §13). Builds the data
// with the app's own domain functions (fresh ids from newId(), the live-game flow with its strict chip
// check), runs migrate() + full validation, checks the expected season totals, then writes data.json.
// Refuses to run unless data.json is still the empty §6.3 file. Run from the repo root:
//   node scripts/import-season1.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

// The domain sources import "./x.js" (TypeScript convention); map those to the .ts files on disk so
// Node's built-in type stripping can load them. No build step, no dependency.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context); }
        catch (err) {
          if (specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
            return next(specifier.slice(0, -3) + ".ts", context);
          }
          throw err;
        }
      }`),
);

const { newId } = await import("../src/domain/ids.ts");
const { addPlayer, createFirstSeason } = await import("../src/domain/adminOps.ts");
const { startGame, addBuyIn, setFinalStack, finishLocalGame, finishGameChange } = await import("../src/domain/liveGame.ts");
const { chipCheck } = await import("../src/domain/results.ts");
const { migrate } = await import("../src/domain/migrations.ts");
const { seasonStandings } = await import("../src/domain/standings.ts");

const DATA_FILE = fileURLToPath(new URL("../data/data.json", import.meta.url));

const PLAYERS = ["Selmon Bhai", "Dinosaur", "Muthmare", "Kaka"];
const SEASON_START = "2026-10-15";
const BUY_IN = 1000;
const GAMES = [
  { date: "2026-10-15", stacks: { "Selmon Bhai": 1295, Dinosaur: 1230, Muthmare: 0, Kaka: 1475 } },
  { date: "2026-10-16", stacks: { "Selmon Bhai": 2945, Dinosaur: 0, Muthmare: 55 } },
  { date: "2026-10-18", stacks: { "Selmon Bhai": 140, Dinosaur: 1810, Muthmare: 845, Kaka: 1205 } },
  { date: "2026-10-19", stacks: { "Selmon Bhai": 815, Dinosaur: 810, Muthmare: 1605, Kaka: 770 } },
];
const EXPECTED = {
  "Selmon Bhai": { net: 1195, games: 4 },
  Kaka: { net: 450, games: 3 },
  Dinosaur: { net: -150, games: 4 },
  Muthmare: { net: -1495, games: 4 },
};

function fail(message) {
  console.error(`import-season1: ${message}`);
  process.exit(1);
}

// 21:00 wall-clock time in America/New_York on `date`, as an ISO instant (handles EDT/EST).
function nineInNewYork(date) {
  const guess = new Date(`${date}T21:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (wall - guess.getTime())).toISOString();
}

// ---- guard: only into the untouched initial file ----------------------------------------------------

const current = migrate(JSON.parse(readFileSync(DATA_FILE, "utf8")));
if (current.players.length || current.seasons.length || current.games.length || current.liveGame !== null) {
  fail("data/data.json is not the empty initial file (§6.3). Nothing written.");
}

// ---- build with the app's own functions -------------------------------------------------------------

let data = current;
const firstAt = nineInNewYork(GAMES[0].date);
for (const name of PLAYERS) data = addPlayer({ id: newId(), name, type: "regular", now: firstAt })(data);
data = createFirstSeason({ id: newId(), today: SEASON_START })(data);

const idOf = (name) => data.players.find((p) => p.name === name)?.id ?? fail(`unknown player ${name}`);
const nameOf = (id) => data.players.find((p) => p.id === id)?.name ?? "?";

for (const { date, stacks } of GAMES) {
  const at = nineInNewYork(date);
  const names = PLAYERS.filter((n) => n in stacks);
  let game = startGame(data, { id: newId(), playerIds: names.map(idOf), mode: "season", guestChoice: null, date, now: at });
  for (const n of names) game = addBuyIn(game, idOf(n), BUY_IN, at);
  for (const n of names) game = setFinalStack(game, idOf(n), String(stacks[n]));
  const entry = finishLocalGame(game, nameOf); // throws unless the strict chip check passes
  if (!chipCheck(entry.game).ok) fail(`chip check failed for ${date}`);
  data = finishGameChange(entry)(data);
}

// ---- validate + assert the expected totals before writing ------------------------------------------

const validated = migrate(JSON.parse(JSON.stringify(data)));
const season = validated.seasons[0];
const rows = seasonStandings(validated, season.id);
for (const [name, want] of Object.entries(EXPECTED)) {
  const row = rows.find((r) => r.name === name);
  if (!row || row.net !== want.net || row.gamesPlayed !== want.games) {
    fail(`expected ${name} ${want.net} (${want.games} games), got ${row ? `${row.net} (${row.gamesPlayed})` : "no row"}`);
  }
}
if (rows.length !== PLAYERS.length) fail(`expected ${PLAYERS.length} standings rows, got ${rows.length}`);
const sum = rows.reduce((s, r) => s + r.net, 0);
if (sum !== 0) fail(`season net winnings sum to ${sum}, not 0`);

writeFileSync(DATA_FILE, `${JSON.stringify(validated, null, 2)}\n`);
console.log(`Wrote ${validated.games.length} games, ${validated.players.length} players to data/data.json.`);
for (const r of rows) console.log(`  ${r.name.padEnd(12)} ${String(r.net).padStart(6)}  (${r.gamesPlayed} games)`);
