import { describe, expect, it } from "vitest";
import {
  addedPlayerMessage,
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
