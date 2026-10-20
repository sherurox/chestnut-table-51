import type { ID } from "../domain/types.js";
import type { KeyValueStore } from "../storage/localKeys.js";

// Home and season celebrations (visual only). Every one is gated by animationsAllowed(); the
// localStorage keys behind them are non-secret and update even when animations are off.

// One new-game signal for Home, shared by the rank-arrow pulse and the winner confetti. isNew comes from
// checkLastSeenGame (read once, before ct51.lastSeenGame is updated); latest is the new season game it is
// about. The pulse follows the signal alone; the confetti also needs the "Last night" card to be showing
// that game (cardGameId), so it never bursts over a newer incognito game.
export function newGameCelebration(
  isNew: boolean,
  allowed: boolean,
  latest: ID | null,
  cardGameId: ID | null,
): { pulse: boolean; confetti: boolean } {
  const play = isNew && allowed;
  return { pulse: play, confetti: play && latest !== null && cardGameId === latest };
}

// ---- Winner confetti ---------------------------------------------------------------------------

export const CONFETTI_MAX = 40;
export const CONFETTI_MS = 1500; // the whole burst, including the longest particle's delay
// Brand colours: brass, then the chip tones (red, blue, black).
export const CONFETTI_COLORS = ["#d6b35e", "#f0d68b", "#a8322a", "#1f4f8c", "#1c1a17"];

export interface ConfettiParticle {
  x: number; // start, % across the card
  dx: number; // px sideways drift
  dy: number; // px fall
  rot: number; // deg spin
  delay: number; // ms
  duration: number; // ms (delay + duration ≤ CONFETTI_MS)
  color: string;
  w: number; // px
  h: number; // px
}

// mulberry32: small seeded PRNG, so a burst is reproducible in tests.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function confettiParticles(count = 32, seed = Date.now()): ConfettiParticle[] {
  const rand = prng(seed);
  const n = Math.max(0, Math.min(CONFETTI_MAX, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => {
    const delay = Math.round(rand() * 200);
    return {
      x: 10 + rand() * 80,
      dx: Math.round((rand() - 0.5) * 140),
      dy: Math.round(70 + rand() * 90),
      rot: Math.round((rand() - 0.5) * 720),
      delay,
      duration: Math.round(900 + rand() * (CONFETTI_MS - 900 - delay)),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      w: 6 + Math.round(rand() * 4),
      h: 8 + Math.round(rand() * 6),
    };
  });
}

// ---- Champion crown ----------------------------------------------------------------------------

export const SEEN_CHAMPION_PREFIX = "ct51.seenChampion.";

// The closed season's crown drops in once per phone per season: true only the first time, and the key
// is set either way (with animations off it simply shows, and won't drop later either).
export function checkChampionCrown(seasonId: ID, store: Pick<KeyValueStore, "getItem" | "setItem"> | null, allowed: boolean): boolean {
  try {
    if (!store) return false;
    const key = SEEN_CHAMPION_PREFIX + seasonId;
    if (store.getItem(key) !== null) return false;
    store.setItem(key, "1");
    return allowed;
  } catch {
    return false; // storage blocked: plain display
  }
}
