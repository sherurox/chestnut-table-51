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
