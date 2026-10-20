import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTANT_PATHS } from "../design/motion.js";
import { isStandalone } from "./platform.js";
import { PULL_THRESHOLD, pullOffset, pullOutcome, pullToRefreshEnabled } from "./pullToRefresh.js";

describe("pull-to-refresh gating", () => {
  it("installed app only: a browser tab gets no custom gesture", () => {
    expect(pullToRefreshEnabled("/", true)).toBe(true);
    expect(pullToRefreshEnabled("/", false)).toBe(false);
    expect(pullToRefreshEnabled("/games", false)).toBe(false);
  });

  it("Home and Games only", () => {
    expect(pullToRefreshEnabled("/games", true)).toBe(true);
    for (const path of ["/seasons", "/seasons/s1", "/more", "/games/g1", "/players/a", "/history", "/admin", "/admin/start"]) {
      expect(pullToRefreshEnabled(path, true)).toBe(false);
    }
  });

  it("never on the live/end screens", () => {
    for (const path of INSTANT_PATHS) expect(pullToRefreshEnabled(path, true)).toBe(false);
  });

  it("refreshes only past the threshold, and never while a refresh is running", () => {
    expect(PULL_THRESHOLD).toBe(70);
    expect(pullOutcome(69, false)).toBe("ignore");
    expect(pullOutcome(70, false)).toBe("refresh");
    expect(pullOutcome(200, false)).toBe("refresh");
    expect(pullOutcome(200, true)).toBe("ignore");
  });

  it("the chip offset is damped and capped", () => {
    expect(pullOffset(-20)).toBe(0);
    expect(pullOffset(50)).toBeLessThan(50);
    expect(pullOffset(10_000)).toBe(80);
  });
});

describe("isStandalone", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (displayStandalone: boolean, iosStandalone?: boolean) => {
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: displayStandalone && q.includes("standalone") }) });
    vi.stubGlobal("navigator", { standalone: iosStandalone, userAgent: "" });
  };

  it("installed app (display-mode: standalone, or iOS navigator.standalone)", () => {
    stub(true);
    expect(isStandalone()).toBe(true);
    stub(false, true);
    expect(isStandalone()).toBe(true);
  });

  it("a normal browser tab", () => {
    stub(false, false);
    expect(isStandalone()).toBe(false);
    stub(false);
    expect(isStandalone()).toBe(false);
  });
});
