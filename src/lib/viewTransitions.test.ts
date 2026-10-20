import { describe, expect, it } from "vitest";
import {
  canViewTransition,
  hashPathname,
  installViewTransitionGuard,
  morphNames,
  noteCommittedPath,
  supportsViewTransitions,
  transitionDirection,
  viewTransitionRunning,
  type GuardWindow,
} from "./viewTransitions.js";

// A fake window whose startViewTransition records each call and finishes when told to.
function fakeWindow(withApi: boolean) {
  const started: unknown[] = [];
  const popListeners: Array<() => void> = [];
  const finishers: Array<() => void> = [];
  const dataset: DOMStringMap = {};
  const document: GuardWindow["document"] = { documentElement: { dataset } };
  if (withApi) {
    document.startViewTransition = ((arg: () => void) => {
      started.push(arg);
      arg();
      const finished = new Promise<void>((resolve) => finishers.push(resolve));
      return { finished, ready: finished, updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
    }) as unknown as Document["startViewTransition"];
  }
  const win: GuardWindow = { document, location: { hash: "#/" }, addEventListener: (_type, l) => popListeners.push(l) };
  return { win, started, dataset, finishAll: () => finishers.forEach((f) => f()), pop: () => popListeners.forEach((l) => l()) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("canViewTransition", () => {
  it("runs between ordinary screens when motion is on and the API exists", () => {
    expect(canViewTransition("/", "/games", false, true)).toBe(true);
    expect(canViewTransition("/", "/players/a", false, true)).toBe(true);
    expect(canViewTransition("/players/a", "/", false, true)).toBe(true);
  });

  it("never into, out of or on a live/end screen", () => {
    for (const [from, to] of [
      ["/", "/admin/live"],
      ["/admin/live", "/"],
      ["/admin/live", "/admin/end"],
      ["/admin/end", "/admin/live"],
      ["/admin/end", "/games"],
      ["/admin", "/admin/live"],
    ] as const) {
      expect(canViewTransition(from, to, false, true)).toBe(false);
    }
  });

  it("never with motion off, without the API, or for a same-screen tap", () => {
    expect(canViewTransition("/", "/games", true, true)).toBe(false);
    expect(canViewTransition("/", "/games", false, false)).toBe(false);
    expect(canViewTransition("/games", "/games", false, true)).toBe(false);
  });
});

describe("helpers", () => {
  it("reads the path out of a HashRouter hash", () => {
    expect(hashPathname("#/players/abc")).toBe("/players/abc");
    expect(hashPathname("#/games?season=s1")).toBe("/games");
    expect(hashPathname("")).toBe("/");
    expect(hashPathname("#")).toBe("/");
  });

  it("slides back on browser back and when moving left along the tabs", () => {
    expect(transitionDirection("/", "/games", false)).toBe("forward");
    expect(transitionDirection("/more", "/seasons", false)).toBe("back");
    expect(transitionDirection("/", "/players/a", false)).toBe("forward");
    expect(transitionDirection("/players/a", "/", true)).toBe("back");
  });

  it("morph names are per player and valid CSS identifiers", () => {
    expect(morphNames("aB3_-x9Z")).toEqual({ rank: "ct-rank-aB3_-x9Z", name: "ct-name-aB3_-x9Z" });
    expect(morphNames("a.b c")).toEqual({ rank: "ct-rank-a_b_c", name: "ct-name-a_b_c" });
    expect(morphNames("a").name).not.toBe(morphNames("b").name);
  });

  it("detects the API", () => {
    expect(supportsViewTransitions(undefined)).toBe(false);
    expect(supportsViewTransitions({})).toBe(false);
    expect(supportsViewTransitions({ startViewTransition: () => {} })).toBe(true);
  });
});

describe("installViewTransitionGuard", () => {
  it("API missing: installs nothing and changes nothing (navigation just happens)", () => {
    const { win } = fakeWindow(false);
    expect(installViewTransitionGuard(win, () => false)).toBe(false);
    expect(win.document.startViewTransition).toBeUndefined();
  });

  it("lets an allowed transition through, marks its direction, and clears it when done", async () => {
    const { win, started, dataset, finishAll } = fakeWindow(true);
    installViewTransitionGuard(win, () => false);
    noteCommittedPath("/");
    win.location.hash = "#/games";
    let updated = false;
    win.document.startViewTransition!(() => {
      updated = true;
    });
    expect(started).toHaveLength(1);
    expect(updated).toBe(true);
    expect(dataset.vt).toBe("forward");
    expect(viewTransitionRunning()).toBe(true);
    finishAll();
    await tick();
    expect(dataset.vt).toBeUndefined();
    expect(viewTransitionRunning()).toBe(false);
  });

  it("browser back replays as a back slide", async () => {
    const { win, dataset, pop, finishAll } = fakeWindow(true);
    installViewTransitionGuard(win, () => false);
    noteCommittedPath("/players/a");
    win.location.hash = "#/";
    pop();
    win.document.startViewTransition!(() => {});
    expect(dataset.vt).toBe("back");
    finishAll();
    await tick();
  });

  it("a popstate that changed no screen doesn't make the next tap slide back", async () => {
    const { win, dataset, pop, finishAll } = fakeWindow(true);
    installViewTransitionGuard(win, () => false);
    noteCommittedPath("/");
    win.location.hash = "#/";
    pop(); // same hash: React Router commits nothing, so AppShell never reports a new screen
    win.location.hash = "#/games";
    win.document.startViewTransition!(() => {});
    expect(dataset.vt).toBe("forward");
    finishAll();
    await tick();
  });

  it("refuses into, out of and on the live/end screens: the update still runs, nothing animates", async () => {
    for (const [from, to] of [
      ["/", "/admin/live"],
      ["/admin/live", "/"],
      ["/admin/live", "/admin/end"],
    ] as const) {
      const { win, started, dataset } = fakeWindow(true);
      installViewTransitionGuard(win, () => false);
      noteCommittedPath(from);
      win.location.hash = `#${to}`;
      let updated = false;
      const t = win.document.startViewTransition!(() => {
        updated = true;
      });
      await t.finished;
      expect(updated).toBe(true);
      expect(started).toHaveLength(0);
      expect(dataset.vt).toBeUndefined();
    }
  });

  it("refuses when motion is off (OS or in-app), even for a back replay", async () => {
    const { win, started, pop } = fakeWindow(true);
    installViewTransitionGuard(win, () => true);
    noteCommittedPath("/players/a");
    win.location.hash = "#/";
    pop();
    let updated = false;
    await win.document.startViewTransition!(() => {
      updated = true;
    }).finished;
    expect(updated).toBe(true);
    expect(started).toHaveLength(0);
  });
});
