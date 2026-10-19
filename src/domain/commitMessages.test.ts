import { describe, expect, it } from "vitest";
import {
  addedPlayerMessage,
  clearedLiveGameMessage,
  discardedLiveGameMessage,
  finishedGameMessage,
  startedLiveGameMessage,
  archivedPlayerMessage,
  presetBuyInsMessage,
  promotedGuestMessage,
  renamedPlayerMessage,
  startedSeasonMessage,
  unarchivedPlayerMessage,
} from "./commitMessages.js";

describe("commit messages", () => {
  it("matches the §8.4 style", () => {
    expect(addedPlayerMessage("Amit", "regular")).toBe("Admin: added player Amit");
    expect(addedPlayerMessage("Rohan", "guest")).toBe("Admin: added guest Rohan");
    expect(renamedPlayerMessage("Amit", "Amit K")).toBe("Admin: renamed player Amit to Amit K");
    expect(archivedPlayerMessage("Amit")).toBe("Admin: archived player Amit");
    expect(unarchivedPlayerMessage("Amit")).toBe("Admin: unarchived player Amit");
    expect(promotedGuestMessage("Rohan")).toBe("Admin: promoted guest Rohan to regular");
    expect(startedSeasonMessage("Season 1")).toBe("Admin: started Season 1");
  });

  it("lists presets sorted with dollar separators", () => {
    expect(presetBuyInsMessage([2000, 1000, 1500])).toBe("Admin: updated preset buy-ins ($1,000 / $1,500 / $2,000)");
  });
});

describe("live game commit messages", () => {
  it("matches the §8.4 style", () => {
    expect(startedLiveGameMessage()).toBe("Admin: started live game");
    expect(clearedLiveGameMessage()).toBe("Admin: cleared stuck live game");
    expect(discardedLiveGameMessage()).toBe("Admin: discarded live game");
    const base = { date: "2026-10-24", seasonName: "Season 1", playerCount: 5, promotedNames: [] };
    expect(finishedGameMessage({ ...base, mode: "season" })).toBe("Admin: finished game 2026-10-24 (Season 1, 5 players)");
    expect(finishedGameMessage({ ...base, mode: "incognito", playerCount: 4 })).toBe(
      "Admin: finished incognito game 2026-10-24 (4 players)",
    );
    expect(finishedGameMessage({ ...base, mode: "season", promotedNames: ["Rohan"] })).toBe(
      "Admin: finished game 2026-10-24 (Season 1, 5 players; promoted guest Rohan)",
    );
    expect(finishedGameMessage({ ...base, mode: "season", promotedNames: ["Rohan", "Dev"] })).toBe(
      "Admin: finished game 2026-10-24 (Season 1, 5 players; promoted guests Rohan, Dev)",
    );
  });
});
