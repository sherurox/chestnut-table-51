import { describe, expect, it, vi } from "vitest";
import { createReloader, isChunkLoadError, onNewVersionActive, RELOAD_FLAG_KEY, shouldDeferUpdate } from "./appUpdate.js";

function session() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("reloadOnce (stale chunk after a deploy)", () => {
  it("reloads exactly once per tab session, then lets the error screen show", () => {
    const s = session();
    const reload = vi.fn();
    // Page load 1: the chunk 404s.
    const first = createReloader({ session: s, reload, isOnline: () => true });
    expect(first.reloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // The vite:preloadError listener and the lazy() catch both ask on the same failure: still one reload.
    expect(first.reloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // Page load 2 (same tab, flag survives): still failing → no second reload.
    const second = createReloader({ session: s, reload, isOnline: () => true });
    expect(second.reloadOnce()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows one reload again for the next deploy once a chunk has loaded fine", () => {
    const s = session();
    const reload = vi.fn();
    createReloader({ session: s, reload, isOnline: () => true }).reloadOnce();
    const afterReload = createReloader({ session: s, reload, isOnline: () => true });
    afterReload.clear();
    expect(s.map.has(RELOAD_FLAG_KEY)).toBe(false);
    expect(createReloader({ session: s, reload, isOnline: () => true }).reloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("never reloads offline (the new version can't be fetched) or without sessionStorage (no loop guard)", () => {
    const reload = vi.fn();
    expect(createReloader({ session: session(), reload, isOnline: () => false }).reloadOnce()).toBe(false);
    expect(createReloader({ session: null, reload, isOnline: () => true }).reloadOnce()).toBe(false);
    const throwing = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    expect(createReloader({ session: throwing, reload, isOnline: () => true }).reloadOnce()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("isChunkLoadError", () => {
  it("recognises Chrome, Safari and Firefox wording", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/AdminRoutes-Bus5mFRc.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("service worker update policy", () => {
  it("auto-reloads viewer screens", () => {
    for (const hash of ["", "#/", "#/games", "#/players/abc", "#/administrator"]) {
      expect(shouldDeferUpdate(hash)).toBe(false);
    }
  });

  it("never auto-reloads admin screens, including mid-game", () => {
    for (const hash of ["#/admin", "#/admin/", "#/admin/live", "#/admin/end", "#/admin/players"]) {
      expect(shouldDeferUpdate(hash)).toBe(true);
    }
  });

  it("onNewVersionActive reloads a viewer page but only flags the update mid-game", () => {
    const reload = vi.fn();
    onNewVersionActive("#/games", reload);
    expect(reload).toHaveBeenCalledTimes(1);
    onNewVersionActive("#/admin/live", reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
