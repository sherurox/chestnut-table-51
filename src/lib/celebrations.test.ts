import { describe, expect, it } from "vitest";
import { animationsAllowed } from "../design/motion.js";
import {
  CONFETTI_COLORS,
  CONFETTI_MAX,
  CONFETTI_MS,
  checkChampionCrown,
  confettiParticles,
  newGameCelebration,
  SEEN_CHAMPION_PREFIX,
} from "./celebrations.js";
import { checkNewGame, SEEN_WATERMARK_KEY } from "./lastSeenGame.js";
import type { Game } from "../domain/types.js";

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

const on = animationsAllowed({ osReduced: false, appOn: true }, "/");
const off = animationsAllowed({ osReduced: false, appOn: false }, "/");

const CREATED: Record<string, string> = { g1: "2026-10-16T01:00:00.000Z", g2: "2026-10-17T01:00:00.000Z" };
const T1 = CREATED.g1!;
const T2 = CREATED.g2!;
const gameWith = (id: string) => ({ id, createdAt: CREATED[id]! }) as Game;

// What Home does on open: read the signal once (before the watermark updates), then decide both effects.
// card: the game the "Last night" card shows (defaults to the new season game itself).
const homeOpens = (latest: string | null, store: ReturnType<typeof memoryStore>, allowed: boolean, card: string | null = latest) =>
  newGameCelebration(checkNewGame(latest ? gameWith(latest) : null, store, (id) => CREATED[id] ?? null), allowed, latest, card);

describe("the shared new-game signal (rank pulse + winner confetti)", () => {
  it("first ever visit: neither plays, the watermark is set", () => {
    const store = memoryStore();
    expect(homeOpens("g1", store, on)).toEqual({ pulse: false, confetti: false });
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe(T1);
  });

  it("same game as last visit: neither plays", () => {
    const store = memoryStore({ [SEEN_WATERMARK_KEY]: T1 });
    expect(homeOpens("g1", store, on)).toEqual({ pulse: false, confetti: false });
  });

  it("a new game: both play, once, and agree while the card shows that game", () => {
    const store = memoryStore({ [SEEN_WATERMARK_KEY]: T1 });
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
    const store = memoryStore({ [SEEN_WATERMARK_KEY]: T1 });
    expect(homeOpens("g2", store, on, "incognito-3")).toEqual({ pulse: true, confetti: false });
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe(T2);
    expect(newGameCelebration(true, true, null, null)).toEqual({ pulse: true, confetti: false });
  });

  it("animations off: no confetti (or pulse), but the key still updates", () => {
    const store = memoryStore({ [SEEN_WATERMARK_KEY]: T1 });
    expect(homeOpens("g2", store, off)).toEqual({ pulse: false, confetti: false });
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe(T2);
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

describe("champion crown (once per phone per season)", () => {
  it("drops the first time a season is opened, never again for that season", () => {
    const store = memoryStore();
    expect(checkChampionCrown("s1", store, on)).toBe(true);
    expect(store.map.get(SEEN_CHAMPION_PREFIX + "s1")).toBe("1");
    expect(checkChampionCrown("s1", store, on)).toBe(false);
    expect(checkChampionCrown("s2", store, on)).toBe(true); // a different season drops once too
    expect(checkChampionCrown("s2", store, on)).toBe(false);
  });

  it("stale keys from wiped test seasons don't affect a real season (keys are per season id)", () => {
    const store = memoryStore({ [SEEN_CHAMPION_PREFIX + "s1"]: "1", [SEEN_CHAMPION_PREFIX + "s2"]: "1" });
    expect(checkChampionCrown("Hq4_Zr8w", store, on)).toBe(true);
    expect(checkChampionCrown("Hq4_Zr8w", store, on)).toBe(false);
  });

  it("animations off: no drop, and the season counts as seen", () => {
    const store = memoryStore();
    expect(checkChampionCrown("s1", store, off)).toBe(false);
    expect(store.map.has(SEEN_CHAMPION_PREFIX + "s1")).toBe(true);
    expect(checkChampionCrown("s1", store, on)).toBe(false);
  });

  it("storage missing or blocked: plain display", () => {
    expect(checkChampionCrown("s1", null, on)).toBe(false);
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(checkChampionCrown("s1", blocked, on)).toBe(false);
  });
});
