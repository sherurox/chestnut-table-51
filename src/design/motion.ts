import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { playSound } from "../lib/sound.js";

// Motion helpers. Everything respects prefers-reduced-motion and the in-app Animations setting
// (animationsAllowed), and nothing here ever delays input:
// animations are visual only (the value, list order and handlers are always already up to date).

const QUERY = "(prefers-reduced-motion: reduce)";
// In-app "Animations" setting on More (non-secret). "off" behaves exactly like prefers-reduced-motion.
export const MOTION_KEY = "ct51.motion";
const MOTION_EVENT = "ct51-motion-change";

// The live game and end screens are where the admin taps fast: nothing animates there.
export const INSTANT_PATHS = ["/admin/live", "/admin/end"];

export interface MotionEnv {
  osReduced: boolean; // prefers-reduced-motion: reduce
  appOn: boolean; // the in-app Animations setting
}

// THE animation check: every animation in the app asks this (directly or through the helpers below).
// Off when the phone asks for reduced motion, when Animations is Off in the app, or on the live/end screens.
export function animationsAllowed(env: MotionEnv, pathname?: string): boolean {
  return !env.osReduced && env.appOn && !(pathname !== undefined && INSTANT_PATHS.includes(pathname));
}

export function readMotionSetting(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setMotionSetting(on: boolean): void {
  try {
    if (on) localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, "off");
  } catch {
    // storage unavailable: nothing to remember
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MOTION_EVENT));
}

export function currentMotionEnv(): MotionEnv {
  const osReduced = typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true;
  return { osReduced, appOn: readMotionSetting() };
}

function subscribeMotion(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia?.(QUERY);
  mql?.addEventListener("change", listener);
  window.addEventListener(MOTION_EVENT, listener);
  window.addEventListener("storage", listener); // other tabs
  return () => {
    mql?.removeEventListener("change", listener);
    window.removeEventListener(MOTION_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

// true = animations are off everywhere (OS reduced motion or the in-app setting).
export function motionReduced(): boolean {
  return !animationsAllowed(currentMotionEnv());
}

export function useMotionReduced(): boolean {
  return useSyncExternalStore(subscribeMotion, motionReduced, () => false);
}

// The in-app setting alone, for the toggle on More.
export function useMotionSetting(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotionSetting, () => true);
}

// true = show and hide things at once, no transitions or count-ups (live/end screens, or motion off).
export function isInstant(pathname: string, reduced: boolean): boolean {
  return !animationsAllowed({ osReduced: reduced, appOn: true }, pathname);
}

// Runs `key`'s one-time entrance only the first time that key is shown in a row (the player page title
// flip: once per page open, never on re-renders, remounts or a data refresh).
export function createOnce(): (key: string) => boolean {
  let last: string | null = null;
  return (key) => {
    if (key === last) return false;
    last = key;
    return true;
  };
}

// easeOutCubic between `from` and `to` at progress t ∈ [0, 1], rounded to whole dollars.
export function countUpValue(from: number, to: number, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - p) ** 3;
  return Math.round(from + (to - from) * eased);
}

// Animates a number from 0 (first render) or its previous value to `target`. Motion off: no animation.
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = useMotionReduced();
  const [shown, setShown] = useState(reduced ? target : 0);
  const fromRef = useRef(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = (now - start) / durationMs;
      const value = countUpValue(from, target, t);
      setShown(value);
      fromRef.current = value;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return shown;
}

// FLIP: children with data-flip="<key>" slide from their old position to the new one when the order
// changes (rank changes). `deps` should change whenever the order may have changed.
export function useFlip(container: RefObject<HTMLElement | null>, deps: unknown[]): void {
  const positions = useRef(new Map<string, number>());
  const reduced = useMotionReduced();

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"));
    const next = new Map<string, number>();
    for (const el of items) next.set(el.dataset.flip!, el.getBoundingClientRect().top);
    if (!reduced) {
      for (const el of items) {
        const before = positions.current.get(el.dataset.flip!);
        const after = next.get(el.dataset.flip!)!;
        if (before === undefined || before === after) continue;
        el.animate([{ transform: `translateY(${before - after}px)` }, { transform: "none" }], {
          duration: 380,
          easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
        });
      }
    }
    positions.current = next;
  }, deps); // callers pass whatever changes the order

}

// Buy-in tap feedback: restart the chip's CSS "pop" and give a short buzz on phones that support it
// (Android; iOS Safari has no vibrate). Synchronous and cheap: called inside the click handler after
// the buy-in is recorded, so it can never delay the input itself.
export function chipFeedback(el: HTMLElement | null): void {
  if (el && !motionReduced()) {
    el.classList.remove("ct-pop");
    void el.offsetWidth; // restart the animation
    el.classList.add("ct-pop");
  }
  try {
    navigator.vibrate?.(12);
  } catch {
    // not supported
  }
  // Sound isn't motion: the clink follows the Sounds setting, not Animations or reduced motion.
  playSound("chip");
}
