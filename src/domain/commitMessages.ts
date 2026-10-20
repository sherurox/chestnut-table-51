import type { Player } from "./types.js";

// Commit messages for admin writes (CLAUDE.md §8.4). Always prefixed "Admin:".

export function addedPlayerMessage(name: string, type: Player["type"]): string {
  return type === "guest" ? `Admin: added guest ${name}` : `Admin: added player ${name}`;
}

export function renamedPlayerMessage(oldName: string, newName: string): string {
  return `Admin: renamed player ${oldName} to ${newName}`;
}

export function archivedPlayerMessage(name: string): string {
  return `Admin: archived player ${name}`;
}

export function unarchivedPlayerMessage(name: string): string {
  return `Admin: unarchived player ${name}`;
}

export function promotedGuestMessage(name: string): string {
  return `Admin: promoted guest ${name} to regular`;
}

export function presetBuyInsMessage(amounts: number[]): string {
  const list = [...amounts]
    .sort((a, b) => a - b)
    .map((a) => `$${a.toLocaleString("en-US")}`)
    .join(" / ");
  return `Admin: updated preset buy-ins (${list})`;
}

// "Admin: started Season 2 (closed Season 1)", or "Admin: started Season 2" when no season was active.
export function startedSeasonMessage(seasonName: string, closedName?: string): string {
  return closedName ? `Admin: started ${seasonName} (closed ${closedName})` : `Admin: started ${seasonName}`;
}

export function endedSeasonMessage(seasonName: string): string {
  return `Admin: ended ${seasonName}`;
}

export function renamedSeasonMessage(oldName: string, newName: string): string {
  return `Admin: renamed season ${oldName} to ${newName}`;
}

export function startedLiveGameMessage(): string {
  return "Admin: started live game";
}

export function clearedLiveGameMessage(): string {
  return "Admin: cleared stuck live game";
}

export function discardedLiveGameMessage(): string {
  return "Admin: discarded live game";
}

// e.g. "Admin: finished game 2026-10-24 (Season 1, 5 players; promoted guest Rohan)"
export function finishedGameMessage(input: {
  date: string;
  mode: "season" | "incognito";
  seasonName: string;
  playerCount: number;
  promotedNames: string[];
}): string {
  const promoted =
    input.promotedNames.length === 0
      ? ""
      : `; promoted guest${input.promotedNames.length === 1 ? "" : "s"} ${input.promotedNames.join(", ")}`;
  return input.mode === "season"
    ? `Admin: finished game ${input.date} (${input.seasonName}, ${input.playerCount} players${promoted})`
    : `Admin: finished incognito game ${input.date} (${input.playerCount} players)`;
}

// e.g. "Admin: edited game 2026-10-19 (Season 1)", using the game's date after the edit. Guests promoted
// in the same save are named the same way as on finish.
export function editedGameMessage(input: { date: string; seasonName: string; promotedNames: string[] }): string {
  const promoted =
    input.promotedNames.length === 0
      ? ""
      : `; promoted guest${input.promotedNames.length === 1 ? "" : "s"} ${input.promotedNames.join(", ")}`;
  return `Admin: edited game ${input.date} (${input.seasonName}${promoted})`;
}

export function deletedGameMessage(date: string, seasonName: string): string {
  return `Admin: deleted game ${date} (${seasonName})`;
}

export function restoredGameMessage(date: string, seasonName: string): string {
  return `Admin: restored game ${date} (${seasonName})`;
}
