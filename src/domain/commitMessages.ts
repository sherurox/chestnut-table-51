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

export function startedSeasonMessage(seasonName: string): string {
  return `Admin: started ${seasonName}`;
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
