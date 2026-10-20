import { useEffect, useRef, useState } from "react";
import { INSTANT_PATHS } from "../design/motion.js";
import { isStandalone } from "./platform.js";

// Pull-to-refresh: only in the installed app (a browser tab has its own gesture and keeps the header
// refresh button), only on Home and Games, never on the live/end screens. Pulling past the threshold
// runs the same refresh as the header button; a pull while a refresh is running is ignored.

export const PULL_THRESHOLD = 70; // px of finger travel
export const PULL_PATHS = ["/", "/games"];
const MAX_OFFSET = 80; // px the chip travels at most

export function pullToRefreshEnabled(pathname: string, standalone: boolean): boolean {
  return standalone && PULL_PATHS.includes(pathname) && !INSTANT_PATHS.includes(pathname);
}

// What a finished pull does.
export function pullOutcome(distance: number, refreshing: boolean): "refresh" | "ignore" {
  return !refreshing && distance >= PULL_THRESHOLD ? "refresh" : "ignore";
}

// How far the chip has slid out for a finger travel (damped, capped).
export function pullOffset(distance: number): number {
  return Math.max(0, Math.min(MAX_OFFSET, distance * 0.6));
}

export interface PullState {
  offset: number; // px the chip shows, 0 = hidden
  armed: boolean; // released now would refresh
}

// Window touch listeners (passive: they never block scrolling). Starts only at the top of the page.
export function usePullToRefresh(pathname: string, refreshing: boolean, refresh: () => void): PullState {
  const [state, setState] = useState<PullState>({ offset: 0, armed: false });
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const enabled = pullToRefreshEnabled(pathname, isStandalone());

  useEffect(() => {
    if (!enabled) {
      setState({ offset: 0, armed: false });
      return;
    }
    let startY: number | null = null;
    let distance = 0;
    const reset = () => {
      startY = null;
      distance = 0;
      setState({ offset: 0, armed: false });
    };
    const onStart = (e: TouchEvent) => {
      startY = e.touches.length === 1 && window.scrollY <= 0 && !refreshingRef.current ? e.touches[0]!.clientY : null;
      distance = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      distance = e.touches[0]!.clientY - startY;
      if (distance <= 0 || window.scrollY > 0) {
        if (distance < 0) startY = null; // scrolling up the page, not a pull
        setState({ offset: 0, armed: false });
        return;
      }
      setState({ offset: pullOffset(distance), armed: pullOutcome(distance, refreshingRef.current) === "refresh" });
    };
    const onEnd = () => {
      if (startY !== null && pullOutcome(distance, refreshingRef.current) === "refresh") refreshRef.current();
      reset();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [enabled]);

  return enabled ? state : { offset: 0, armed: false };
}
