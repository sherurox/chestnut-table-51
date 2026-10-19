import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

// Motion helpers. Everything respects prefers-reduced-motion, and nothing here ever delays input:
// animations are visual only (the value, list order and handlers are always already up to date).

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", listener);
  return () => mql.removeEventListener("change", listener);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

// easeOutCubic between `from` and `to` at progress t ∈ [0, 1], rounded to whole dollars.
export function countUpValue(from: number, to: number, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - p) ** 3;
  return Math.round(from + (to - from) * eased);
}

// Animates a number from 0 (first render) or its previous value to `target`. Reduced motion: no animation.
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = useReducedMotion();
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
  const reduced = useReducedMotion();

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
  if (el && !prefersReducedMotion()) {
    el.classList.remove("ct-pop");
    void el.offsetWidth; // restart the animation
    el.classList.add("ct-pop");
  }
  try {
    navigator.vibrate?.(12);
  } catch {
    // not supported
  }
}
