import { liveState, tableTotal, type LocalGame } from "../domain/liveGame.js";
import { nextSeasonName } from "../domain/adminOps.js";
import { seasonFullMessage, seasonIsFull } from "../domain/seasonLimit.js";
import type { Data, Game, LiveMarker } from "../domain/types.js";
import { seasonCompleteStartText } from "./seasonText.js";

// Home screen game buttons and "Game on" card. Viewer-safe: no admin code, and it only reads the raw
// ct51.liveGame string (never writes, never sets a corrupt entry aside; that's the admin's job).

export function startGamePath(mode: Game["mode"]): string {
  return `/admin/start?mode=${mode}`;
}

// Start game's preselected mode from its query string (`?mode=incognito`). Anything else is a season game.
export function startModeFromSearch(search: string): Game["mode"] {
  return new URLSearchParams(search).get("mode") === "incognito" ? "incognito" : "season";
}

export interface LocalGameSummary {
  id: string;
  startedAt: string;
  tableTotal: number;
}

export function localGameSummary(raw: string | null): LocalGameSummary | null {
  if (raw === null) return null;
  try {
    const g = JSON.parse(raw) as Partial<LocalGame> | null;
    if (!g || g.v !== 1 || typeof g.id !== "string" || typeof g.startedAt !== "string") return null;
    if (!Array.isArray(g.startPlayers) || !Array.isArray(g.actions)) return null;
    return { id: g.id, startedAt: g.startedAt, tableTotal: tableTotal(liveState(g as LocalGame)) };
  } catch {
    return null;
  }
}

// The last season was ended and no new one has started: no games (either mode) until one does (§5.2).
export function needsNewSeason(data: Data | null): boolean {
  return !!data && data.seasons.length > 0 && !data.seasons.some((s) => s.status === "active");
}

export const SEASONS_ADMIN_PATH = "/admin/seasons";
// Opens Admin → Seasons with "Start new season" pre-filled and its confirm already open.
export const START_SEASON_PATH = "/admin/seasons?start=1";

export function startSeasonFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("start") === "1";
}

// Season-limit wording for Home (§5.2). `ended`: the last season closed after filling up, so the one
// button goes straight to starting the next. `full`: the active season is full but not ended yet (an edit
// or restore filled it), so the season button asks to end it; incognito still works.
export function seasonLimitAction(data: Data | null): { kind: "ended" | "full"; text: string } | null {
  if (!data) return null;
  const active = data.seasons.find((s) => s.status === "active");
  if (active) return seasonIsFull(data, active.id) ? { kind: "full", text: seasonFullMessage(active) } : null;
  const last = data.seasons.slice().sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0];
  if (!last || !seasonIsFull(data, last.id)) return null;
  return { kind: "ended", text: seasonCompleteStartText(last, nextSeasonName(data)) };
}

// The live marker, when it belongs to a game that isn't on this phone.
export function otherPhoneGame(data: Data | null, local: LocalGameSummary | null): LiveMarker | null {
  const marker = data?.liveGame ?? null;
  if (!marker || marker.gameId === local?.id) return null;
  return marker;
}

// "2h 05m" / "12m" since start; never negative (phone clock changes).
export function formatElapsed(startedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  const minutes = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// "9:04 PM" for a game started today, "Oct 18, 9:04 PM" otherwise.
export function formatStarted(startedAt: string, now: Date): string {
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return startedAt;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}
