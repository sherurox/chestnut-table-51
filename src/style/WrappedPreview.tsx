import { WrappedSlideView } from "../components/WrappedSlides.js";
import type { Data, Game } from "../domain/types.js";
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
