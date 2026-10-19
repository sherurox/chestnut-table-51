import type { Change } from "./adminOps.js";
import { chipCheck } from "./results.js";
import { MAX_AMOUNT } from "./schema.js";
import type { BuyIn, Data, Game, ID } from "./types.js";

// A game in progress (CLAUDE.md §9). It lives only on the admin's phone (localStorage) until it is
// finished, so it must survive reloads and work offline. State is an append-only action log: undo is
// "drop the last action", and the current players/buy-ins/mode are always recomputed from the log.

export type GuestChoice = "promote" | "incognito";

export type LiveAction =
  | { type: "buyIn"; player: ID; amount: number; at: string }
  // promote: a late guest joining a season game who will be promoted in the finish commit (§5.5).
  // toIncognito: a late guest whose arrival switched the whole game to incognito.
  | { type: "addPlayer"; player: ID; at: string; promote?: true; toIncognito?: true }
  | { type: "removePlayer"; player: ID; at: string };

export interface LocalGame {
  v: 1;
  id: ID;
  seasonId: ID;
  date: string; // local YYYY-MM-DD, fixed at start (a game that runs past midnight keeps its start date)
  startedAt: string;
  startMode: Game["mode"];
  startPlayers: ID[];
  startPromote: ID[]; // guests the admin chose to add to the season at start
  actions: LiveAction[];
  finalStacks: Record<ID, string>; // as typed on the end screen; not part of undo
  markerSynced: boolean; // false until the §9.2 live marker commit succeeds
}

export interface LiveState {
  players: ID[];
  mode: Game["mode"];
  buyIns: BuyIn[];
  promote: ID[]; // guests to promote in the finish commit (always empty for incognito)
}

// What the finish commit needs: the finished game plus the guests to promote with it.
export interface FinishedEntry {
  game: Game;
  promote: ID[];
}

function playerOrThrow(data: Data, id: ID) {
  const player = data.players.find((p) => p.id === id);
  if (!player) throw new Error("Player not found.");
  if (player.status !== "active") throw new Error(`${player.name} is archived.`);
  return player;
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    throw new Error(`Buy-ins are whole dollars from $1 to $${MAX_AMOUNT.toLocaleString("en-US")}.`);
  }
}

export function liveState(game: LocalGame): LiveState {
  let players = [...game.startPlayers];
  let mode = game.startMode;
  const promote = new Set(game.startPromote);
  const buyIns: BuyIn[] = [];
  for (const a of game.actions) {
    if (a.type === "buyIn") {
      buyIns.push({ player: a.player, amount: a.amount, at: a.at });
    } else if (a.type === "addPlayer") {
      players.push(a.player);
      if (a.promote) promote.add(a.player);
      if (a.toIncognito) mode = "incognito";
    } else {
      players = players.filter((p) => p !== a.player);
      promote.delete(a.player);
    }
  }
  return {
    players,
    mode,
    buyIns,
    promote: mode === "season" ? players.filter((p) => promote.has(p)) : [],
  };
}

export function playerTotal(state: LiveState, player: ID): number {
  return state.buyIns.filter((b) => b.player === player).reduce((sum, b) => sum + b.amount, 0);
}

export function tableTotal(state: LiveState): number {
  return state.buyIns.reduce((sum, b) => sum + b.amount, 0);
}

export interface StartInput {
  id: ID;
  playerIds: ID[];
  mode: Game["mode"];
  // Required when a season game includes any guest (§5.5); ignored otherwise.
  guestChoice: GuestChoice | null;
  date: string;
  now: string;
}

// Guests that force the §5.5 choice: only relevant when the admin picked a season game.
export function guestsNeedingChoice(data: Data, playerIds: ID[], mode: Game["mode"]): ID[] {
  if (mode !== "season") return [];
  return playerIds.filter((id) => data.players.find((p) => p.id === id)?.type === "guest");
}

export function startGame(data: Data, input: StartInput): LocalGame {
  const season = data.seasons.find((s) => s.status === "active");
  if (!season) throw new Error("Create a season before starting a game.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a valid date.");
  if (new Set(input.playerIds).size !== input.playerIds.length) throw new Error("A player is listed twice.");
  if (input.playerIds.length < 2) throw new Error("A game needs at least 2 players.");
  for (const id of input.playerIds) playerOrThrow(data, id);

  const guests = guestsNeedingChoice(data, input.playerIds, input.mode);
  if (guests.length > 0 && !input.guestChoice) {
    throw new Error("Choose whether to add the guests to the season or keep the game incognito.");
  }
  const toIncognito = guests.length > 0 && input.guestChoice === "incognito";

  return {
    v: 1,
    id: input.id,
    seasonId: season.id,
    date: input.date,
    startedAt: input.now,
    startMode: toIncognito ? "incognito" : input.mode,
    startPlayers: [...input.playerIds],
    startPromote: toIncognito ? [] : guests,
    actions: [],
    finalStacks: {},
    markerSynced: false,
  };
}

function withAction(game: LocalGame, action: LiveAction): LocalGame {
  return { ...game, actions: [...game.actions, action] };
}

export function addBuyIn(game: LocalGame, player: ID, amount: number, now: string): LocalGame {
  if (!liveState(game).players.includes(player)) throw new Error("That player isn't in this game.");
  assertAmount(amount);
  return withAction(game, { type: "buyIn", player, amount, at: now });
}

// A late guest joining a season game needs the §5.5 choice; anyone else joins as-is.
export function lateNeedsGuestChoice(data: Data, game: LocalGame, player: ID): boolean {
  return guestsNeedingChoice(data, [player], liveState(game).mode).length > 0;
}

export function addLatePlayer(
  data: Data,
  game: LocalGame,
  player: ID,
  now: string,
  guestChoice: GuestChoice | null = null,
): LocalGame {
  playerOrThrow(data, player);
  if (liveState(game).players.includes(player)) throw new Error("That player is already in this game.");
  const action: LiveAction = { type: "addPlayer", player, at: now };
  if (lateNeedsGuestChoice(data, game, player)) {
    if (!guestChoice) throw new Error("Choose whether to add the guest to the season or keep the game incognito.");
    if (guestChoice === "promote") action.promote = true;
    else action.toIncognito = true;
  }
  return withAction(game, action);
}

// Only for a player tapped by mistake: someone who has bought in must be given a final stack instead.
export function removePlayer(game: LocalGame, player: ID, now: string): LocalGame {
  const state = liveState(game);
  if (!state.players.includes(player)) throw new Error("That player isn't in this game.");
  if (playerTotal(state, player) > 0) throw new Error("Players with buy-ins can't be removed. Enter their final stack.");
  return withAction(game, { type: "removePlayer", player, at: now });
}

export function undo(game: LocalGame): LocalGame {
  if (game.actions.length === 0) return game;
  return { ...game, actions: game.actions.slice(0, -1) };
}

export function setFinalStack(game: LocalGame, player: ID, text: string): LocalGame {
  return { ...game, finalStacks: { ...game.finalStacks, [player]: text } };
}

// Whole dollars, 0 allowed: "1,500" and "$1500" are fine; blank, "12.5" or "abc" are not.
export function parseStack(text: string | undefined): number | null {
  const cleaned = (text ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= MAX_AMOUNT ? n : null;
}

export interface EndCheck {
  ok: boolean;
  blockers: string[];
  allStacksEntered: boolean;
  gap: number; // cash-outs − buy-ins (only meaningful once every stack is entered)
  hint: string | null;
}

// The strict §5.6 check for the end screen, plus the other rules a finished game must meet (§6.2).
export function endCheck(game: LocalGame, nameOf: (id: ID) => string): EndCheck {
  const state = liveState(game);
  const blockers: string[] = [];
  if (state.players.length < 2) blockers.push("A game needs at least 2 players.");
  for (const p of state.players) {
    if (playerTotal(state, p) === 0) blockers.push(`${nameOf(p)} has no buy-in. Add one, or remove them.`);
  }
  const missing = state.players.filter((p) => parseStack(game.finalStacks[p]) === null);
  for (const p of missing) blockers.push(`Enter ${nameOf(p)}'s final stack (whole dollars, 0 is fine).`);

  const chip = chipCheck(draftGame(game, state));
  return {
    ok: blockers.length === 0 && chip.ok,
    blockers,
    allStacksEntered: missing.length === 0,
    gap: chip.gap,
    hint: chip.hint,
  };
}

function draftGame(game: LocalGame, state: LiveState): Game {
  return {
    id: game.id,
    seasonId: game.seasonId,
    date: game.date,
    mode: state.mode,
    status: "finished",
    players: state.players,
    buyIns: state.buyIns,
    cashOuts: state.players.flatMap((p) => {
      const amount = parseStack(game.finalStacks[p]);
      return amount === null ? [] : [{ player: p, amount }];
    }),
    createdAt: game.startedAt,
  };
}

// The game as it will be written. Refuses anything that fails the strict check: there is no override.
export function finishLocalGame(game: LocalGame, nameOf: (id: ID) => string): FinishedEntry {
  const check = endCheck(game, nameOf);
  if (!check.ok) throw new Error(check.blockers[0] ?? "The chip check hasn't passed.");
  const state = liveState(game);
  return { game: draftGame(game, state), promote: state.promote };
}

// The finish commit (§9.5): the game + guest promotions + clearing its live marker, all in one write.
// Duplicate-save guard: if the game id is already on GitHub (a retry after a save whose response was
// lost), return the data unchanged so the write path skips the commit.
export function finishGameChange(entry: FinishedEntry): Change {
  return (data) => {
    if (data.games.some((g) => g.id === entry.game.id)) return data;
    if (!data.seasons.some((s) => s.id === entry.game.seasonId)) throw new Error("This game's season no longer exists.");
    const promote = new Set(entry.game.mode === "season" ? entry.promote : []);
    return {
      ...data,
      players: data.players.map((p) => (promote.has(p.id) && p.type === "guest" ? { ...p, type: "regular" } : p)),
      games: [...data.games, entry.game],
      liveGame: data.liveGame?.gameId === entry.game.id ? null : data.liveGame,
    };
  };
}

export function startMarkerChange(gameId: ID, startedAt: string): Change {
  return (data) => {
    if (data.liveGame?.gameId === gameId) return data;
    if (data.liveGame) throw new Error("Another game is already in progress.");
    if (data.games.some((g) => g.id === gameId)) return data; // already finished and saved
    return { ...data, liveGame: { gameId, startedAt } };
  };
}

// Clears the marker only if it still points at the game the admin saw; otherwise does nothing.
export function clearMarkerChange(gameId: ID): Change {
  return (data) => (data.liveGame?.gameId === gameId ? { ...data, liveGame: null } : data);
}

// "Same players as last game": the newest finished game of any mode, minus anyone archived since.
export function lastGamePlayers(data: Data): ID[] {
  const last = data.games
    .filter((g) => g.status === "finished")
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return [];
  return last.players.filter((id) => data.players.find((p) => p.id === id)?.status === "active");
}
