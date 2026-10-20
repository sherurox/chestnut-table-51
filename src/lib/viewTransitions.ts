import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { isInstant, motionReduced, useMotionReduced } from "../design/motion.js";
import type { ID } from "../domain/types.js";

// Screen transitions with the View Transitions API. React Router starts them (the `viewTransition` prop
// on the bottom tabs and leaderboard rows; browser back replays the reverse), and every start goes
// through the guard installed below, so a transition never runs when motion is off, into, out of or on
// a live/end screen, or on a phone without the API (the navigation then simply happens at once).

const TABS = ["/", "/games", "/seasons", "/more"];

export type Direction = "forward" | "back";

// The parts of `window` the guard uses (a fake one in tests).
export interface GuardWindow {
  document: {
    startViewTransition?: Document["startViewTransition"];
    documentElement: { dataset: DOMStringMap };
  };
  location: { hash: string };
  addEventListener(type: "popstate", listener: () => void): void;
}

export function supportsViewTransitions(doc: { startViewTransition?: unknown } | undefined): boolean {
  return typeof doc?.startViewTransition === "function";
}

// Whether a navigation from → to may run a view transition. Same-screen taps never do.
export function canViewTransition(from: string, to: string, reduced: boolean, supported: boolean): boolean {
  return supported && from !== to && !isInstant(from, reduced) && !isInstant(to, reduced);
}

// Slide direction: browser back/forward slides back; between tabs it follows the tab order.
export function transitionDirection(from: string, to: string, pop: boolean): Direction {
  if (pop) return "back";
  const a = TABS.indexOf(from);
  const b = TABS.indexOf(to);
  return a >= 0 && b >= 0 && b < a ? "back" : "forward";
}

// "#/players/abc?x=1" → "/players/abc" (HashRouter).
export function hashPathname(hash: string): string {
  const path = hash.replace(/^#/, "") || "/";
  return path.split(/[?#]/)[0] || "/";
}

// The view-transition-names a player's rank badge and name share between their leaderboard row and the
// player page header. Unique on screen: each is only set during that player's own row ↔ page transition.
export function morphNames(playerId: ID): { rank: string; name: string } {
  const safe = playerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return { rank: `ct-rank-${safe}`, name: `ct-name-${safe}` };
}

let committedPath: string | null = null;
// Where the last browser back/forward went. A popstate that changes no screen (e.g. the same hash) must
// not turn the next tap into a "back" slide, so a transition only counts as back if it goes there.
let popTarget: string | null = null;
let running = 0;

// AppShell reports every committed screen, so the guard knows where a navigation comes from.
export function noteCommittedPath(pathname: string): void {
  committedPath = pathname;
  popTarget = null;
}

// True while a view transition is animating (AppShell then skips its own screen fade).
export function viewTransitionRunning(): boolean {
  return running > 0;
}

// What a refused start returns: the update runs right away and nothing animates.
function noTransition(update: (() => unknown) | null | undefined): ViewTransition {
  const updateCallbackDone = Promise.resolve().then(() => update?.()).then(() => undefined);
  const finished = updateCallbackDone.catch(() => undefined);
  return { updateCallbackDone, ready: finished, finished, skipTransition: () => {}, types: new Set() } as unknown as ViewTransition;
}

// Wraps document.startViewTransition once at startup, before the router is created. Returns false (and changes nothing) when the API is
// missing: React Router then updates the screen without a transition.
export function installViewTransitionGuard(win: GuardWindow, reduced: () => boolean = motionReduced): boolean {
  const doc = win.document;
  if (!supportsViewTransitions(doc)) return false;
  const native = doc.startViewTransition!.bind(doc);
  // Must be added before the router is created: React flushes popstate updates synchronously inside
  // React Router's own popstate listener, so the transition starts before any later listener runs.
  win.addEventListener("popstate", () => {
    popTarget = hashPathname(win.location.hash);
  });
  committedPath ??= hashPathname(win.location.hash);

  doc.startViewTransition = ((arg?: Parameters<Document["startViewTransition"]>[0]) => {
    const update = typeof arg === "function" ? arg : arg?.update;
    const from = committedPath ?? "/";
    const to = hashPathname(win.location.hash); // history already points at the destination
    const pop = popTarget === to;
    popTarget = null;
    if (!canViewTransition(from, to, reduced(), true)) return noTransition(update);

    const root = doc.documentElement.dataset;
    root.vt = transitionDirection(from, to, pop);
    running++;
    const transition = native(arg);
    void transition.finished
      .catch(() => {})
      .finally(() => {
        running--;
        if (running === 0) delete root.vt;
      });
    return transition;
  }) as Document["startViewTransition"];
  return true;
}

// For links: (to) => whether React Router should run a view transition for this navigation.
export function useViewTransitionTo(): (to: string) => boolean {
  const { pathname } = useLocation();
  const reduced = useMotionReduced();
  return useCallback(
    (to: string) => canViewTransition(pathname, to, reduced, supportsViewTransitions(typeof document === "undefined" ? undefined : document)),
    [pathname, reduced],
  );
}
