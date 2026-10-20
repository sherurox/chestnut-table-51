import { describe, expect, it } from "vitest";
import { animationsAllowed } from "../design/motion.js";
import {
  CONFETTI_COLORS,
  CONFETTI_MAX,
  CONFETTI_MS,
  confettiParticles,
  newGameCelebration,
} from "./celebrations.js";
import { checkLastSeenGame, LAST_SEEN_GAME_KEY } from "./lastSeenGame.js";

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

const on = animationsAllowed({ osReduced: false, appOn: true }, "/");
const off = animationsAllowed({ osReduced: false, appOn: false }, "/");

// What Home does on open: read the signal once (before the key updates), then decide both effects.
// card: the game the "Last night" card shows (defaults to the new season game itself).
const homeOpens = (latest: string | null, store: ReturnType<typeof memoryStore>, allowed: boolean, card: string | null = latest) =>
  newGameCelebration(checkLastSeenGame(latest, store), allowed, latest, card);

describe("the shared new-game signal (rank pulse + winner confetti)", () => {
  it("first ever visit: neither plays, the key is set", () => {
    const store = memoryStore();
    expect(homeOpens("g1", store, on)).toEqual({ pulse: false, confetti: false });
    expect(store.map.get(LAST_SEEN_GAME_KEY)).toBe("g1");
  });

  it("same game as last visit: neither plays", () => {
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(homeOpens("g1", store, on)).toEqual({ pulse: false, confetti: false });
  });

  it("a new game: both play, once, and agree while the card shows that game", () => {
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(homeOpens("g2", store, on)).toEqual({ pulse: true, confetti: true });
    expect(homeOpens("g2", store, on)).toEqual({ pulse: false, confetti: false });
    for (const isNew of [true, false]) {
      for (const allowed of [true, false]) {
        const { pulse, confetti } = newGameCelebration(isNew, allowed, "g2", "g2");
        expect(pulse).toBe(confetti);
      }
    }
  });

  it("the card shows a newer incognito game: arrows still pulse, no confetti", () => {
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(homeOpens("g2", store, on, "incognito-3")).toEqual({ pulse: true, confetti: false });
    expect(store.map.get(LAST_SEEN_GAME_KEY)).toBe("g2");
    expect(newGameCelebration(true, true, null, null)).toEqual({ pulse: true, confetti: false });
  });

  it("animations off: no confetti (or pulse), but the key still updates", () => {
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(homeOpens("g2", store, off)).toEqual({ pulse: false, confetti: false });
    expect(store.map.get(LAST_SEEN_GAME_KEY)).toBe("g2");
    // Turning animations back on doesn't replay an old game.
    expect(homeOpens("g2", store, on)).toEqual({ pulse: false, confetti: false });
  });
});

describe("confettiParticles", () => {
  it("never more than 40 bits, all within 1.5s, in brand colours", () => {
    for (const seed of [1, 42, 999, 123456]) {
      const bits = confettiParticles(1000, seed);
      expect(bits.length).toBe(CONFETTI_MAX);
      for (const b of bits) {
        expect(b.delay + b.duration).toBeLessThanOrEqual(CONFETTI_MS);
        expect(b.duration).toBeGreaterThan(0);
        expect(CONFETTI_COLORS).toContain(b.color);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(100);
      }
    }
    expect(CONFETTI_MS).toBeLessThanOrEqual(1500);
    expect(confettiParticles(-3, 1)).toEqual([]);
  });

  it("a seed gives the same burst (reproducible)", () => {
    expect(confettiParticles(32, 7)).toEqual(confettiParticles(32, 7));
  });
});
