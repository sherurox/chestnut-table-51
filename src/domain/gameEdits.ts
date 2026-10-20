import { assertNoLiveGame, type Change } from "./adminOps.js";
import { guestsNeedingChoice, parseStack, type GuestChoice } from "./liveGame.js";
import { chipCheck } from "./results.js";
import type { BuyIn, Data, Game, ID } from "./types.js";

// Editing, deleting and restoring finished games (CLAUDE.md §5.9). The edit screen holds a GameDraft;
// editCheck runs the strict chip check (§5.6) and every other finished-game rule on it, and builds the
// game as it would be written. The Changes are reapplied to fresh data on a sha conflict (§8.2).

export interface DraftBuyIn {
  amount: string; // as typed
  index: number | null; // position in the original game's buyIns; null for a rebuy added while editing
}

export interface GameDraft {
  date: string;
  mode: Game["mode"];
  players: ID[];
  buyIns: Record<ID, DraftBuyIn[]>;
  stacks: Record<ID, string>;
  // Required when the edited game would be a season game with guests in it (§5.5).
  guestChoice: GuestChoice | null;
}

export function draftFromGame(game: Game): GameDraft {
  const buyIns: Record<ID, DraftBuyIn[]> = {};
  const stacks: Record<ID, string> = {};
  for (const p of game.players) {
    buyIns[p] = [];
    stacks[p] = String(game.cashOuts.find((c) => c.player === p)?.amount ?? "");
  }
  game.buyIns.forEach((b, index) => buyIns[b.player]?.push({ amount: String(b.amount), index }));
  return { date: game.date, mode: game.mode, players: [...game.players], buyIns, stacks, guestChoice: null };
}

// A buy-in as typed: whole dollars from $1 up to the schema maximum, or null.
export function parseBuyIn(text: string | undefined): number | null {
  const n = parseStack(text);
  return n !== null && n >= 1 ? n : null;
}

function isCalendarDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// The latest date a game in this season can have: its end date, or today while it is active.
export function seasonDateRange(data: Data, seasonId: ID, today: string): { min: string; max: string } | null {
  const season = data.seasons.find((s) => s.id === seasonId);
  if (!season) return null;
  return { min: season.startedOn, max: season.status === "closed" && season.endedOn ? season.endedOn : today };
}

function guestsInDraft(data: Data, draft: GameDraft): ID[] {
  return guestsNeedingChoice(data, draft.players, draft.mode);
}

// "Keep incognito" turns the whole game incognito; otherwise the mode is what the admin picked.
export function effectiveMode(data: Data, draft: GameDraft): Game["mode"] {
  return guestsInDraft(data, draft).length > 0 && draft.guestChoice === "incognito" ? "incognito" : draft.mode;
}

// Guests the save will promote to regular (only for a season game, and only when the admin chose to).
export function draftPromotes(data: Data, draft: GameDraft): ID[] {
  const guests = guestsInDraft(data, draft);
  return draft.guestChoice === "promote" ? guests : [];
}

// The game as it would be written. Kept buy-ins stay in their original order with their original
// times; rebuys added while editing are appended with `now`. Unparseable amounts are left out (the
// check reports them). Sets editedAt.
export function buildEditedGame(data: Data, original: Game, draft: GameDraft, now: string): Game {
  const kept = new Map<number, { player: ID; amount: number }>();
  const added: BuyIn[] = [];
  for (const p of draft.players) {
    for (const b of draft.buyIns[p] ?? []) {
      const amount = parseBuyIn(b.amount);
      if (amount === null) continue;
      if (b.index !== null && original.buyIns[b.index]?.player === p) kept.set(b.index, { player: p, amount });
      else added.push({ player: p, amount, at: now });
    }
  }
  const buyIns: BuyIn[] = [
    ...original.buyIns.flatMap((b, i) => {
      const k = kept.get(i);
      return k ? [{ player: k.player, amount: k.amount, at: b.at }] : [];
    }),
    ...added,
  ];
  const cashOuts = draft.players.flatMap((p) => {
    const amount = parseStack(draft.stacks[p]);
    return amount === null ? [] : [{ player: p, amount }];
  });
  return {
    id: original.id,
    seasonId: original.seasonId,
    date: draft.date,
    mode: effectiveMode(data, draft),
    status: "finished",
    players: [...draft.players],
    buyIns,
    cashOuts,
    createdAt: original.createdAt,
    editedAt: now,
  };
}

// Structural equality for JSON-like values; key order doesn't matter and undefined equals missing.
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) if (!sameJson(ra[k], rb[k])) return false;
  return true;
}

// The same game apart from editedAt, with cash-outs compared per player.
function sameContent(a: Game, b: Game): boolean {
  const strip = (g: Game) => ({
    ...g,
    editedAt: undefined,
    cashOuts: Object.fromEntries(g.cashOuts.map((c) => [c.player, c.amount])),
  });
  return sameJson(strip(a), strip(b));
}

export interface EditCheck {
  ok: boolean; // every rule passes (Save also needs !unchanged)
  unchanged: boolean;
  blockers: string[];
  allStacksEntered: boolean;
  gap: number; // cash-outs − buy-ins
  hint: string | null;
  game: Game; // as it would be written
  promote: ID[];
}

export function editCheck(data: Data, original: Game, draft: GameDraft, nameOf: (id: ID) => string, today: string, now: string): EditCheck {
  const blockers: string[] = [];
  const range = seasonDateRange(data, original.seasonId, today);
  if (!isCalendarDate(draft.date)) blockers.push("Pick a valid date.");
  else if (range && draft.date !== original.date && (draft.date < range.min || draft.date > range.max)) {
    blockers.push(`The date must be within its season (${range.min} to ${range.max}).`);
  }
  if (draft.players.length < 2) blockers.push("A game needs at least 2 players.");
  for (const p of draft.players) {
    const rows = draft.buyIns[p] ?? [];
    if (rows.length === 0) blockers.push(`${nameOf(p)} has no buy-in. Add one, or remove them.`);
    if (rows.some((b) => parseBuyIn(b.amount) === null)) {
      blockers.push(`Each of ${nameOf(p)}'s buy-ins must be whole dollars from $1 up.`);
    }
  }
  const missing = draft.players.filter((p) => parseStack(draft.stacks[p]) === null);
  for (const p of missing) blockers.push(`Enter ${nameOf(p)}'s final stack (whole dollars, 0 is fine).`);
  const guests = guestsInDraft(data, draft);
  if (guests.length > 0 && !draft.guestChoice) {
    blockers.push("Choose whether to add the guests to the season or keep the game incognito.");
  }

  const game = buildEditedGame(data, original, draft, now);
  const promote = draftPromotes(data, draft);
  const chip = chipCheck(game);
  return {
    ok: blockers.length === 0 && chip.ok,
    unchanged: promote.length === 0 && sameContent(game, original),
    blockers,
    allStacksEntered: missing.length === 0,
    gap: chip.gap,
    hint: chip.hint,
    game,
    promote,
  };
}

function freshGame(data: Data, id: ID): Game {
  const game = data.games.find((g) => g.id === id);
  if (!game) throw new Error("This game no longer exists.");
  return game;
}

const STALE = "This game changed since you opened it. Reload and edit again.";

// The edit commit: the edited game + any guest promotions. `before` is the game as the admin opened it.
// Duplicate guard: if GitHub already has exactly `after` (a retry after a lost response), nothing changes.
export function editGameChange(input: { before: Game; after: Game; promote: ID[] }): Change {
  return (data) => {
    const fresh = freshGame(data, input.after.id);
    if (sameJson(fresh, input.after)) return data;
    assertNoLiveGame(data);
    if (!sameJson(fresh, input.before)) throw new Error(STALE);
    if (fresh.status !== "finished") throw new Error("Deleted games can't be edited. Restore it first.");
    const promote = new Set(input.after.mode === "season" ? input.promote : []);
    return {
      ...data,
      players: data.players.map((p) => (promote.has(p.id) && p.type === "guest" ? { ...p, type: "regular" } : p)),
      games: data.games.map((g) => (g.id === input.after.id ? input.after : g)),
    };
  };
}

// Soft delete (§5.9). Already deleted: nothing changes.
export function deleteGameChange(id: ID, now: string): Change {
  return (data) => {
    if (freshGame(data, id).status === "deleted") return data;
    assertNoLiveGame(data);
    return { ...data, games: data.games.map((g): Game => (g.id === id ? { ...g, status: "deleted", deletedAt: now } : g)) };
  };
}

// Brings the game back exactly as it was before it was deleted. Already finished: nothing changes.
export function restoreGameChange(id: ID): Change {
  return (data) => {
    if (freshGame(data, id).status === "finished") return data;
    assertNoLiveGame(data);
    return {
      ...data,
      games: data.games.map((g): Game => {
        if (g.id !== id) return g;
        const { deletedAt: _deletedAt, ...rest } = g;
        return { ...rest, status: "finished" };
      }),
    };
  };
}

// Deleted games for the bin, most recently deleted first.
export function deletedGames(data: Data): Game[] {
  return data.games
    .filter((g) => g.status === "deleted")
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "") || b.date.localeCompare(a.date));
}
