import { MAX_AMOUNT, normalizeName } from "./schema.js";
import type { Data, ID, Player, Season } from "./types.js";

// Every admin write is expressed as a Change so the write path can reapply it to freshly fetched
// data on a sha conflict (CLAUDE.md §8.2). Ops throw a readable Error when a business rule fails.
export type Change = (data: Data) => Data;

export const MAX_PRESETS = 6;

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name can't be empty.");
  return trimmed;
}

function assertNameFree(data: Data, name: string, exceptId?: ID): void {
  const normalized = normalizeName(name);
  const clash = data.players.find((p) => p.id !== exceptId && normalizeName(p.name) === normalized);
  if (clash) throw new Error(`There's already a player named ${clash.name}.`);
}

function findPlayer(data: Data, id: ID): Player {
  const player = data.players.find((p) => p.id === id);
  if (!player) throw new Error("Player not found.");
  return player;
}

function updatePlayer(data: Data, id: ID, patch: Partial<Player>): Data {
  return { ...data, players: data.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function addPlayer(input: { id: ID; name: string; type: Player["type"]; now: string }): Change {
  return (data) => {
    const name = cleanName(input.name);
    assertNameFree(data, name);
    if (data.players.some((p) => p.id === input.id)) throw new Error("Player id already in use.");
    const player: Player = { id: input.id, name, type: input.type, status: "active", createdAt: input.now };
    return { ...data, players: [...data.players, player] };
  };
}

export function renamePlayer(id: ID, newName: string): Change {
  return (data) => {
    const player = findPlayer(data, id);
    const name = cleanName(newName);
    if (name === player.name) throw new Error("That's already their name.");
    assertNameFree(data, name, id);
    return updatePlayer(data, id, { name });
  };
}

export function archivePlayer(id: ID): Change {
  return (data) => {
    if (findPlayer(data, id).status === "archived") throw new Error("Player is already archived.");
    return updatePlayer(data, id, { status: "archived" });
  };
}

export function unarchivePlayer(id: ID): Change {
  return (data) => {
    if (findPlayer(data, id).status === "active") throw new Error("Player is already active.");
    return updatePlayer(data, id, { status: "active" });
  };
}

export function promoteGuest(id: ID): Change {
  return (data) => {
    if (findPlayer(data, id).type !== "guest") throw new Error("Only guests can be promoted.");
    return updatePlayer(data, id, { type: "regular" });
  };
}

// Returns an error message, or null when the list is acceptable. Shared by the op and the settings form.
export function presetBuyInsError(amounts: number[]): string | null {
  if (amounts.length < 1) return "Add at least one preset.";
  if (amounts.length > MAX_PRESETS) return `At most ${MAX_PRESETS} presets.`;
  for (const a of amounts) {
    if (!Number.isInteger(a) || a < 1 || a > MAX_AMOUNT) {
      return `Each preset must be a whole dollar amount from $1 to $${MAX_AMOUNT.toLocaleString("en-US")}.`;
    }
  }
  if (new Set(amounts).size !== amounts.length) return "Presets must all be different.";
  return null;
}

export function setPresetBuyIns(amounts: number[]): Change {
  return (data) => {
    const error = presetBuyInsError(amounts);
    if (error) throw new Error(error);
    return { ...data, settings: { ...data.settings, presetBuyIns: [...amounts].sort((a, b) => a - b) } };
  };
}

export function createFirstSeason(input: { id: ID; today: string }): Change {
  return (data) => {
    if (data.seasons.length > 0) throw new Error("A season already exists.");
    return {
      ...data,
      seasons: [{ id: input.id, name: "Season 1", status: "active", startedOn: input.today }],
    };
  };
}

// Season management (CLAUDE.md §5.2). At most one season is active; after "End season" there may be none
// until a new one starts. Both are blocked while a game is live (the marker is checked here, against fresh
// data; this phone's local game and unsynced queue are checked by seasonActionBlock in the UI).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertNoLiveGame(data: Data): void {
  if (data.liveGame) throw new Error("A game is in progress. Finish it (or clear the stuck game) first.");
}

// Field checks, shared by the ops (which throw) and the Seasons screen (which shows them inline before
// any confirm). Each returns an error message, or null when the value is fine.
export function seasonNameError(data: Data, name: string, exceptId?: ID): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name can't be empty.";
  const normalized = normalizeName(trimmed);
  const clash = data.seasons.find((s) => s.id !== exceptId && normalizeName(s.name) === normalized);
  return clash ? `There's already a season named ${clash.name}.` : null;
}

export function seasonStartError(data: Data, startedOn: string, today: string): string | null {
  if (!ISO_DATE.test(startedOn)) return "Pick a valid start date.";
  if (startedOn > today) return "The start date can't be in the future.";
  const latestStart = data.seasons.reduce((max, s) => (s.startedOn > max ? s.startedOn : max), "");
  if (startedOn < latestStart) return "The new season can't start before the last one did.";
  return null;
}

export function renameSeasonError(data: Data, id: ID, newName: string): string | null {
  const season = data.seasons.find((s) => s.id === id);
  if (!season) return "Season not found.";
  if (newName.trim() === season.name) return "That's already its name.";
  return seasonNameError(data, newName, id);
}

function throwIf(error: string | null): void {
  if (error) throw new Error(error);
}

// "Season N+1", skipping any number already used as a name.
export function nextSeasonName(data: Data): string {
  const taken = new Set(data.seasons.map((s) => normalizeName(s.name)));
  let n = data.seasons.length + 1;
  while (taken.has(normalizeName(`Season ${n}`))) n++;
  return `Season ${n}`;
}

// Why this phone can't end or start a season right now, or null. The admin's own live game and unsynced
// games belong to the current season, so they must be finished and synced first.
export function seasonActionBlock(input: { data: Data; hasLocalGame: boolean; queued: number }): string | null {
  if (input.hasLocalGame) return "A game is running on this phone. Finish or discard it first.";
  if (input.data.liveGame) return "A game is in progress. Finish it (or clear the stuck game) first.";
  if (input.queued > 0) {
    return `This phone has ${input.queued} unsynced game${input.queued === 1 ? "" : "s"}. Sync ${input.queued === 1 ? "it" : "them"} first.`;
  }
  return null;
}

export function endSeason(input: { today: string }): Change {
  return (data) => {
    assertNoLiveGame(data);
    const active = data.seasons.find((s) => s.status === "active");
    if (!active) throw new Error("There's no active season to end.");
    const closed: Season = { ...active, status: "closed", endedOn: input.today };
    return { ...data, seasons: data.seasons.map((s) => (s.id === active.id ? closed : s)) };
  };
}

// Closes the active season (if any) and starts a new one, in one change.
export function startNewSeason(input: { id: ID; name: string; startedOn: string; today: string }): Change {
  return (data) => {
    assertNoLiveGame(data);
    throwIf(seasonNameError(data, input.name));
    const name = input.name.trim();
    if (data.seasons.some((s) => s.id === input.id)) throw new Error("Season id already in use.");
    throwIf(seasonStartError(data, input.startedOn, input.today));
    const seasons = data.seasons.map((s): Season => (s.status === "active" ? { ...s, status: "closed", endedOn: input.today } : s));
    return { ...data, seasons: [...seasons, { id: input.id, name, status: "active", startedOn: input.startedOn }] };
  };
}

export function renameSeason(id: ID, newName: string): Change {
  return (data) => {
    throwIf(renameSeasonError(data, id, newName));
    const name = newName.trim();
    return { ...data, seasons: data.seasons.map((s) => (s.id === id ? { ...s, name } : s)) };
  };
}
