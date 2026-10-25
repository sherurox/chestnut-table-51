import { useEffect, useState } from "react";
import { WrappedSlideView } from "../components/WrappedSlides.js";
import type { Data, Game } from "../domain/types.js";
import type { WrappedCardModel } from "../lib/drawWrappedCard.js";
import { wrappedModel, type WrappedSlide } from "../lib/wrapped.js";
import { SLIDE_BACKGROUND } from "../lib/wrappedNav.js";

// DEV ONLY (#/style): every Wrapped slide kind on a made-up closed season with long names and big amounts,
// drawn with the real slide component on its background.
const NOW = "2026-10-24T21:00:00.000Z";
const NAMES = ["Venkataramanan Subramaniam", "Shreyas", "Ishaan Chattopadhyay-Banerjee", "Om"];
const BUY_IN = 100_000;

// One net result per player (sums to 0).
const RESULTS = [
  [125_000, -40_000, -60_000, -25_000],
  [80_000, -30_000, -20_000, -30_000],
  [-50_000, 90_000, -10_000, -30_000],
  [60_000, -20_000, -45_000, 5_000],
  [-10_000, 30_000, -50_000, 30_000],
];

function game(n: number, results: number[]): Game {
  const date = `2026-10-${String(10 + n).padStart(2, "0")}`;
  const players = results.map((_, i) => `p${i}`);
  return {
    id: `w-g${n}`,
    seasonId: "w",
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((player) => ({ player, amount: BUY_IN, at: NOW })),
    cashOuts: results.map((r, i) => ({ player: `p${i}`, amount: BUY_IN + r })),
    createdAt: `${date}T21:00:00.000Z`,
  };
}

const DATA: Data = {
  version: 1,
  settings: { presetBuyIns: [1000] },
  players: NAMES.map((name, i) => ({ id: `p${i}`, name, type: "regular", status: "active", createdAt: NOW })),
  seasons: [{ id: "w", name: "Diwali Cup Season", status: "closed", startedOn: "2026-10-01", endedOn: "2026-10-16" }],
  games: RESULTS.map((r, i) => game(i + 1, r)),
  liveGame: null,
};

// Ishaan (last, down every night, a nemesis, never led) has every kind; the leader adds a best night and a #1.
const loser = wrappedModel(DATA, "w", "p2")!.slides;
const leader = wrappedModel(DATA, "w", "p0")!.slides;
const SLIDES: { label: string; slide: WrappedSlide }[] = [
  ...loser.map((slide) => ({ label: `${slide.kind} · last place`, slide })),
  ...leader.filter((s) => s.kind === "bestNight" || s.kind === "top" || s.kind === "finish").map((slide) => ({ label: `${slide.kind} · champion`, slide })),
];

export function WrappedPreview() {
  return (
    <div className="flex flex-col gap-4">
      {SLIDES.map(({ label, slide }) => (
        <figure key={label} className="flex flex-col gap-1">
          <figcaption className="ct-muted text-xs">{label}</figcaption>
          <div className="ct-wrapped-frame" data-theme="dark" data-bg={SLIDE_BACKGROUND[slide.kind]}>
            <div className="ct-wrapped-content">
              <WrappedSlideView slide={slide} />
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}

// The story image for a 2-player season (the champion has a long name), drawn with the real drawing code.
const PAIR: Data = {
  ...DATA,
  players: [
    { id: "a", name: "Venkataramanan Subramaniam", type: "regular", status: "active", createdAt: NOW },
    { id: "b", name: "Om", type: "regular", status: "active", createdAt: NOW },
  ],
  seasons: [{ id: "w", name: "Season 1", status: "closed", startedOn: "2026-10-01", endedOn: "2026-10-12" }],
  games: [
    [1_250_000, -1_250_000],
    [-300_000, 300_000],
  ].map((results, i) => ({
    ...game(i + 1, [0, 0]),
    players: ["a", "b"],
    buyIns: ["a", "b"].map((player) => ({ player, amount: 2_000_000, at: NOW })),
    cashOuts: results.map((r, j) => ({ player: j === 0 ? "a" : "b", amount: 2_000_000 + r })),
  })),
};
const FINALES = ["a", "b"].map(
  (id) => wrappedModel(PAIR, "w", id)!.slides.find((s): s is WrappedCardModel => s.kind === "finale")!,
);

export function WrappedImagePreview() {
  const [urls, setUrls] = useState<(string | null)[]>(FINALES.map(() => null));
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      const { drawWrappedCard } = await import("../lib/drawWrappedCard.js");
      for (const [i, finale] of FINALES.entries()) {
        const blob = await drawWrappedCard(finale);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        made.push(url);
        setUrls((prev) => prev.map((u, j) => (j === i ? url : u)));
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  return (
    <div className="grid grid-cols-2 gap-3">
      {FINALES.map((f, i) => (
        <figure key={f.name} className="m-0">
          {urls[i] ? (
            <img src={urls[i]!} alt={`${f.name}'s Wrapped`} className="block h-auto w-full rounded-lg" width={1080} height={1920} />
          ) : (
            <div className="ct-panel aspect-[9/16]" />
          )}
          <figcaption className="ct-muted mt-1 text-xs">{f.placeLabel}</figcaption>
        </figure>
      ))}
    </div>
  );
}
