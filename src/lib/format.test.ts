import { afterEach, describe, expect, it } from "vitest";
import { calendarDate, formatDate } from "./format.js";
import { shareDate } from "./share.js";

// Game dates are calendar days. Parsed as UTC ("new Date('2026-10-19')") they show the day before in
// US time zones, so every display path goes through calendarDate. Node applies a TZ change immediately.
const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe.each(["America/New_York", "Asia/Kolkata"])("game dates in %s", (tz) => {
  it("shows a 2026-10-19 game as Oct 19", () => {
    process.env.TZ = tz;
    if (tz === "America/New_York") {
      expect(new Date("2026-10-19").getDate()).toBe(18); // the bug: UTC midnight is the 18th here
    }
    expect(calendarDate("2026-10-19")?.getDate()).toBe(19);
    expect(formatDate("2026-10-19")).toBe("Mon, Oct 19"); // game history, game detail, player page, chart
    expect(shareDate("2026-10-19")).toBe("Mon 19 Oct"); // share results, Last night card
  });

  it("keeps the calendar day when a time follows the date", () => {
    process.env.TZ = tz;
    expect(formatDate("2026-10-19T12:00:00")).toBe("Mon, Oct 19");
    expect(formatDate("2026-01-01")).toBe("Thu, Jan 1");
  });
});

describe("calendarDate", () => {
  it("rejects strings that aren't a real date", () => {
    expect(calendarDate("2026-02-30")).toBeNull();
    expect(calendarDate("Oct 19")).toBeNull();
    expect(formatDate("not a date")).toBe("not a date");
  });
});
