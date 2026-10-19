import { MAX_AMOUNT, normalizeName } from "./schema.js";
import type { Data, ID, Player } from "./types.js";

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
