import { describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import liveRaw from "../../data/data.json" with { type: "json" };

// Unlike seed.test.ts (which pins exact standings against a frozen fixture), this only
// checks that the live data/data.json — which real admin saves mutate — stays well-formed.
describe("live data/data.json", () => {
  it("passes migrate() + schema validation", () => {
    expect(() => migrate(liveRaw)).not.toThrow();
  });

  // Since the test-data reset (2026-10-20) every id comes from newId(): 8 random characters, never "p1"/"s1".
  it("uses only random newId() ids, no sequential test ids", () => {
    const data = migrate(liveRaw);
    const ids = [...data.players, ...data.seasons, ...data.games].map((x) => x.id);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });
});
