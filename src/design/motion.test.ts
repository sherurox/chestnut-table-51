import { describe, expect, it } from "vitest";
import { countUpValue } from "./motion.js";

describe("countUpValue", () => {
  it("starts at the old value, ends exactly at the new one, and stays whole dollars", () => {
    expect(countUpValue(0, 1450, 0)).toBe(0);
    expect(countUpValue(0, 1450, 1)).toBe(1450);
    expect(countUpValue(0, 1450, 5)).toBe(1450);
    expect(Number.isInteger(countUpValue(0, 1450, 0.37))).toBe(true);
  });

  it("counts down into negative amounts too", () => {
    expect(countUpValue(300, -1950, 1)).toBe(-1950);
    expect(countUpValue(300, -1950, 0.5)).toBeLessThan(300);
  });
});
