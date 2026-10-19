import { describe, expect, it } from "vitest";
import { daysUntilExpiry, localIsoDate } from "./dates.js";

describe("localIsoDate", () => {
  it("formats the local calendar date with zero padding", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("daysUntilExpiry", () => {
  const today = new Date(2026, 9, 19, 22, 30); // local 19 Oct 2026, late evening

  it("counts whole calendar days ahead", () => {
    expect(daysUntilExpiry("2026-10-20", today)).toBe(1);
    expect(daysUntilExpiry("2026-11-02", today)).toBe(14);
    expect(daysUntilExpiry("2027-10-19", today)).toBe(365);
  });

  it("is 0 on the expiry day and negative after", () => {
    expect(daysUntilExpiry("2026-10-19", today)).toBe(0);
    expect(daysUntilExpiry("2026-10-18", today)).toBe(-1);
  });

  it("is unaffected by a DST change in between", () => {
    expect(daysUntilExpiry("2026-11-09", new Date(2026, 10, 1, 0, 30))).toBe(8);
  });

  it("returns null for malformed or impossible dates", () => {
    expect(daysUntilExpiry("2026-02-30", today)).toBeNull();
    expect(daysUntilExpiry("19/10/2026", today)).toBeNull();
    expect(daysUntilExpiry("", today)).toBeNull();
  });
});
