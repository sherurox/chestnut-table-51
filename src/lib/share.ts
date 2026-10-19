import { gameResult } from "../domain/results.js";
import { seasonStandings } from "../domain/standings.js";
import type { Data, Game } from "../domain/types.js";
import { formatSignedDollars } from "./format.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-24" → "Sat 24 Oct", read as a calendar date (no time zone shift).
export function shareDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

// Plain text for the group chat after a save (CLAUDE.md §9.8). `data` must already include the game.
export function shareText(data: Data, game: Game): string {
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? "?";
  const season = data.seasons.find((s) => s.id === game.seasonId);
  const header = game.mode === "season" ? (season?.name ?? "Season") : "Incognito";
  const results = game.players
    .map((id) => ({ name: nameOf(id), result: gameResult(game, id) }))
    .sort((a, b) => b.result - a.result || a.name.localeCompare(b.name))
    .map((r) => `${r.name} ${formatSignedDollars(r.result)}`)
    .join(" · ");
  const lines = [`CT51 · ${header} · ${shareDate(game.date)}`, results];
  if (game.mode === "season") {
    const leader = seasonStandings(data, game.seasonId)[0];
    if (leader) lines.push(`Season leader: ${leader.name} ${formatSignedDollars(leader.net)}`);
  }
  return lines.join("\n");
}
