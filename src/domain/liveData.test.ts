import { describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import liveRaw from "../../data/data.json" with { type: "json" };

// Unlike seed.test.ts (which pins exact standings against a frozen fixture), this only
// checks that the live data/data.json — which real admin saves mutate — stays well-formed.
describe("live data/data.json", () => {
  it("passes migrate() + schema validation", () => {
    expect(() => migrate(liveRaw)).not.toThrow();
  });
});
