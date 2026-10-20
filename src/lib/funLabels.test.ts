import { describe, expect, it } from "vitest";
import { AWARDS, BADGES, awardValue, formLabel } from "./funLabels.js";

describe("funLabels", () => {
  it("names every award and badge once", () => {
    expect(new Set(AWARDS.map((a) => a.kind)).size).toBe(7);
    expect(new Set(BADGES.map((b) => b.kind)).size).toBe(6);
    expect(AWARDS.find((a) => a.kind === "atm")?.name).toBe("Rebuy Machine");
  });

  it("formats award values", () => {
    expect(awardValue("shark", 200.4)).toBe("+$200 a game");
    expect(awardValue("atm", 1)).toBe("1 rebuy");
    expect(awardValue("rock", 0.333)).toBe("0.3 rebuys a game");
    expect(awardValue("bigNight", 800)).toBe("+$800");
    expect(awardValue("rollercoaster", 537.6)).toBe("swings of ±$538");
    expect(awardValue("ironMan", 6)).toBe("6 games");
  });

  it("describes form in words for screen readers", () => {
    expect(formLabel(["L", "E", "W"])).toBe("Last 3 games, oldest first: lost, even, won");
    expect(formLabel(["W"])).toBe("Last 1 game, oldest first: won");
  });
});
