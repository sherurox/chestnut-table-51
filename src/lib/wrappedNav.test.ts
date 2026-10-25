import { describe, expect, it } from "vitest";
import { dateRange, shortDate, SLIDE_BACKGROUND, stepSlide, storyKey } from "./wrappedNav.js";
import type { WrappedSlideKind } from "./wrapped.js";

describe("storyKey", () => {
  it("arrows move, Escape closes, anything else is ignored", () => {
    expect(storyKey("ArrowRight")).toBe("next");
    expect(storyKey("ArrowLeft")).toBe("previous");
    expect(storyKey("Escape")).toBe("close");
    expect(storyKey("Enter")).toBeNull();
    expect(storyKey(" ")).toBeNull();
  });
});

describe("stepSlide", () => {
  it("moves one slide and stops at both ends", () => {
    expect(stepSlide(0, 5, "next")).toBe(1);
    expect(stepSlide(3, 5, "previous")).toBe(2);
    expect(stepSlide(0, 5, "previous")).toBe(0);
    expect(stepSlide(4, 5, "next")).toBe(4);
  });
});

describe("SLIDE_BACKGROUND", () => {
  const order: WrappedSlideKind[] = ["intro", "finish", "bestNight", "top", "toughNight", "nemesis", "badges", "finale"];

  it("neighbours never share a background, whichever optional slides are left out", () => {
    for (const keepTough of [true, false]) {
      for (const keepNemesis of [true, false]) {
        const kinds = order.filter((k) => (k !== "toughNight" || keepTough) && (k !== "nemesis" || keepNemesis));
        for (let i = 1; i < kinds.length; i++) {
          expect(SLIDE_BACKGROUND[kinds[i]!]).not.toBe(SLIDE_BACKGROUND[kinds[i - 1]!]);
        }
      }
    }
  });
});

describe("dates", () => {
  it("short local dates and a range", () => {
    expect(shortDate("2026-10-19")).toBe("Oct 19");
    expect(dateRange("2026-10-15", "2026-10-26")).toBe("Oct 15 – Oct 26");
    expect(dateRange("2026-10-15", "2026-10-15")).toBe("Oct 15");
  });
});
