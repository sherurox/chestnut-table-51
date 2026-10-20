import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  animationsAllowed,
  countUpValue,
  currentMotionEnv,
  isInstant,
  MOTION_KEY,
  motionReduced,
  readMotionSetting,
  setMotionSetting,
} from "./motion.js";

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

describe("animationsAllowed (the one animation check)", () => {
  const on = { osReduced: false, appOn: true };

  it("animates by default on ordinary screens", () => {
    expect(animationsAllowed(on)).toBe(true);
    for (const path of ["/", "/games", "/players/a", "/admin", "/admin/start"]) expect(animationsAllowed(on, path)).toBe(true);
  });

  it("the phone's reduced-motion setting turns everything off", () => {
    expect(animationsAllowed({ osReduced: true, appOn: true })).toBe(false);
    expect(animationsAllowed({ osReduced: true, appOn: true }, "/")).toBe(false);
  });

  it("Animations: Off in the app behaves exactly like reduced motion", () => {
    const off = { osReduced: false, appOn: false };
    for (const path of [undefined, "/", "/players/a", "/admin/live"]) {
      expect(animationsAllowed(off, path)).toBe(animationsAllowed({ osReduced: true, appOn: true }, path));
      expect(animationsAllowed(off, path)).toBe(false);
    }
  });

  it("live and end screens never animate", () => {
    expect(animationsAllowed(on, "/admin/live")).toBe(false);
    expect(animationsAllowed(on, "/admin/end")).toBe(false);
    expect(isInstant("/admin/live", false)).toBe(true);
    expect(isInstant("/", false)).toBe(false);
    expect(isInstant("/", true)).toBe(true);
  });
});

describe("in-app Animations setting (ct51.motion)", () => {
  const g = globalThis as { localStorage?: unknown };

  function withStorage(store: unknown, run: () => void) {
    const before = g.localStorage;
    g.localStorage = store;
    try {
      run();
    } finally {
      g.localStorage = before;
    }
  }

  it("defaults to On, and Off is remembered", () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
    withStorage(store, () => {
      expect(readMotionSetting()).toBe(true);
      expect(currentMotionEnv()).toEqual({ osReduced: false, appOn: true });
      expect(motionReduced()).toBe(false);
      setMotionSetting(false);
      expect(map.get(MOTION_KEY)).toBe("off");
      expect(readMotionSetting()).toBe(false);
      expect(motionReduced()).toBe(true);
      setMotionSetting(true);
      expect(map.has(MOTION_KEY)).toBe(false);
      expect(motionReduced()).toBe(false);
    });
  });

  it("storage blocked: animations stay on", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    withStorage(blocked, () => expect(readMotionSetting()).toBe(true));
  });
});

describe("motion-off CSS", () => {
  const css = readFileSync(new URL("./design.css", import.meta.url), "utf-8");
  const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const open = css.indexOf("{", start);
  let end = open;
  for (let i = open, depth = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const rules = (block: string) =>
    [...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, decl]) => ({
      selectors: sel!.split(",").map((s) => s.trim()),
      decl: decl!.trim(),
    }));
  const media = css.slice(open + 1, end);

  it("Animations: Off (data-motion) switches off exactly what prefers-reduced-motion does", () => {
    const prefix = ':root[data-motion="off"]';
    const mirror = rules(css.slice(end + 1))
      .filter((r) => r.selectors.every((s) => s.startsWith(prefix)))
      .map((r) => ({ selectors: r.selectors.map((s) => s.slice(prefix.length).trim()), decl: r.decl }));
    expect(mirror).toEqual(rules(media));
  });

  it("covers the screen transitions", () => {
    expect(media).toContain("::view-transition-group(*)");
  });
});
