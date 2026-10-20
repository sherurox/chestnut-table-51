import { parseBuyIn, type GameDraft } from "../domain/gameEdits.js";
import { finalStack, gameResult, totalBuyIns } from "../domain/results.js";
import { champion, seasonStandings } from "../domain/standings.js";
import type { Data, Game, ID, Season } from "../domain/types.js";
import { formatDate, formatDollars, formatSignedDollars } from "./format.js";

// Confirm wording for editing, deleting and restoring games (Admin, CLAUDE.md §5.9).

function nameIn(data: Data) {
  return (id: ID) => data.players.find((p) => p.id === id)?.name ?? id;
}

// "Mon, Oct 19 · Season 1 · Amit, Rohan, Shreyas · Winner: Amit +$1,500" (the game named in delete and
// restore confirms). Incognito games say so; tied winners are joined with "&".
export function gameSummary(data: Data, game: Game): string {
  const nameOf = nameIn(data);
  const season = data.seasons.find((s) => s.id === game.seasonId)?.name ?? "Unknown season";
  const where = game.mode === "incognito" ? `${season} · Incognito` : season;
  const best = Math.max(...game.players.map((p) => gameResult(game, p)));
  const winners = game.players.filter((p) => gameResult(game, p) === best).map(nameOf);
  const winner = best > 0 ? `Winner: ${winners.join(" & ")} ${formatSignedDollars(best)}` : "No winner";
  return `${formatDate(game.date)} · ${where} · ${game.players.map(nameOf).join(", ")} · ${winner}`;
}

// What an edit changes, one readable line each, in this order: date, mode, players removed and added,
// each changed buy-in and final stack (old → new), guests promoted. Empty when nothing changes.
// Buy-ins are matched through the draft (each kept row remembers its original position), so removing
// one in the middle reads as "removed buy-in 2", not as every later one changing.
export function editDiffLines(data: Data, before: Game, draft: GameDraft, after: Game, promote: ID[]): string[] {
  const nameOf = nameIn(data);
  const money = (text: string) => {
    const n = parseBuyIn(text);
    return n === null ? `"${text}"` : formatDollars(n);
  };
  const lines: string[] = [];
  if (after.date !== before.date) lines.push(`Date: ${formatDate(before.date)} → ${formatDate(after.date)}`);
  if (after.mode !== before.mode) {
    lines.push(
      after.mode === "season"
        ? "Mode: Incognito → Season (now counts in the standings)"
        : "Mode: Season → Incognito (no longer counts in the standings)",
    );
  }
  for (const p of before.players) {
    if (after.players.includes(p)) continue;
    lines.push(`Removed ${nameOf(p)} (${formatDollars(totalBuyIns(before, p))} in, ${formatDollars(finalStack(before, p))} out)`);
  }
  for (const p of after.players) {
    if (before.players.includes(p)) continue;
    const buyIns = (draft.buyIns[p] ?? []).map((r) => money(r.amount));
    lines.push(`Added ${nameOf(p)}: buy-ins ${buyIns.join(" · ") || "none"}, final stack ${formatDollars(finalStack(after, p))}`);
  }
  for (const p of after.players) {
    if (!before.players.includes(p)) continue;
    const name = nameOf(p);
    const rows = draft.buyIns[p] ?? [];
    let n = 0;
    before.buyIns.forEach((b, i) => {
      if (b.player !== p) return;
      n++;
      const row = rows.find((r) => r.index === i);
      if (!row) lines.push(`${name}: removed buy-in ${n} (${formatDollars(b.amount)})`);
      else if (parseBuyIn(row.amount) !== b.amount) lines.push(`${name}: buy-in ${n} ${formatDollars(b.amount)} → ${money(row.amount)}`);
    });
    for (const r of rows) {
      if (r.index === null || before.buyIns[r.index]?.player !== p) lines.push(`${name}: new buy-in ${money(r.amount)}`);
    }
    const oldStack = finalStack(before, p);
    const newStack = finalStack(after, p);
    if (oldStack !== newStack) lines.push(`${name}: final stack ${formatDollars(oldStack)} → ${formatDollars(newStack)}`);
  }
  for (const p of promote) lines.push(`Promotes guest ${nameOf(p)} to regular`);
  return lines;
}

export type GameAction = "edit" | "delete" | "restore";

const VERB: Record<GameAction, string> = { edit: "Editing", delete: "Deleting", restore: "Restoring" };

function top(data: Data, seasonId: ID): { id: ID; name: string; net: number } | null {
  const id = champion(data, seasonId);
  const row = id ? seasonStandings(data, seasonId).find((r) => r.playerId === id) : undefined;
  return row ? { id: row.playerId, name: row.name, net: row.net } : null;
}

// For a game in a closed season: the §5.9 warning plus who is champion now versus after the change
// (champions are computed, never stored). `after` is the data with the change applied.
export function championChangeLine(before: Data, after: Data, season: Season, action: GameAction): string {
  const warning = `This season is closed. ${VERB[action]} will change its final standings and possibly its champion.`;
  const was = top(before, season.id);
  const will = top(after, season.id);
  const show = (c: { name: string; net: number }) => `${c.name} (${formatSignedDollars(c.net)})`;
  let change: string;
  if (was && will && was.id === will.id) {
    change =
      was.net === will.net
        ? `${was.name} stays champion (${formatSignedDollars(was.net)}).`
        : `${was.name} stays champion (${formatSignedDollars(was.net)} → ${formatSignedDollars(will.net)}).`;
  } else if (!was && !will) {
    change = "There's no champion either way.";
  } else {
    const now = was ? `Champion now: ${show(was)}.` : "No champion now.";
    const then = will ? `After this ${action}: ${show(will)}.` : `After this ${action}: no champion (no season games left).`;
    change = `${now} ${then}`;
  }
  return `${warning} ${change}`;
}

// The warning shown before editing a closed season's game starts, with its current champion.
export function closedSeasonWarning(data: Data, season: Season): string {
  const was = top(data, season.id);
  const now = was ? `Current champion: ${was.name} (${formatSignedDollars(was.net)}).` : "It has no champion right now.";
  return `This season is closed. Editing will change its final standings and possibly its champion. ${now}`;
}
