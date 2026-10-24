import { describe, expect, it } from "vitest";
import { AWARDS, BADGES, SITUATION_NAMES, SITUATION_RULES, TIER_NAMES, TIER_RULES, awardValue, badgeTitle, formLabel } from "./funLabels.js";

describe("funLabels", () => {
  it("names every award and badge once", () => {
    expect(new Set(AWARDS.map((a) => a.kind)).size).toBe(7);
    expect(new Set(BADGES.map((b) => b.kind)).size).toBe(22);
    expect(AWARDS.find((a) => a.kind === "atm")?.name).toBe("Rebuy Machine");
    for (const b of BADGES) expect(b.icon && b.name && b.howToEarn).toBeTruthy();
  });

  it("keeps the original badge names", () => {
    expect(BADGES.slice(0, 6).map((b) => b.name)).toEqual(["First blood", "Hat trick", "Double up", "Phoenix", "Ten club", "Half century"]);
  });

  it("has a rule for every tier and situation, once each", () => {
    expect(TIER_RULES.map((t) => t.tier).sort()).toEqual(Object.keys(TIER_NAMES).sort());
    expect(SITUATION_RULES.map((s) => s.situation).sort()).toEqual(Object.keys(SITUATION_NAMES).sort());
    // Priority order matches fun.ts `situation`.
    expect(SITUATION_RULES.map((s) => s.situation)).toEqual(["heater", "comeback", "coldStreak", "rebuyKing", "backAfterBreak"]);
  });

  it("shows ×N only for repeats", () => {
    expect(badgeTitle("Season champion", 1)).toBe("Season champion");
    expect(badgeTitle("Season champion", 2)).toBe("Season champion ×2");
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
