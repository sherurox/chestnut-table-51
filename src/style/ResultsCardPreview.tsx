import { useEffect, useState } from "react";
import type { Data, Game } from "../domain/types.js";
import { resultsCardModel } from "../lib/resultsCard.js";

// DEV ONLY (#/style): the results card for four sample nights, drawn with the real drawing code.
const NOW = "2026-10-24T21:00:00.000Z";
const NAMES = ["Shreyas", "Rohan", "Amit", "Andhar", "Venkataramanan Subramaniam", "Kabir", "Ishaan", "Dev", "Neel", "Arjun", "Tanmay", "Om"];

// stacks: [buy-ins, final stack] per player index
function game(id: string, date: string, stacks: [number[], number][], mode: Game["mode"] = "season"): Game {
  const players = stacks.map((_, i) => `p${i}`);
  return {
    id,
    seasonId: "s1",
    date,
    mode,
    status: "finished",
    players,
    buyIns: stacks.flatMap(([amounts], i) => amounts.map((amount) => ({ player: `p${i}`, amount, at: NOW }))),
    cashOuts: stacks.map(([, out], i) => ({ player: `p${i}`, amount: out })),
    createdAt: `${date}T21:00:00.000Z`,
  };
}

const earlier = Array.from({ length: 7 }, (_, n) =>
  game(`e${n}`, `2026-10-${String(10 + n).padStart(2, "0")}`, [[[1000], 1000 + 200 * ((n % 3) - 1)], [[1000], 1000 - 200 * ((n % 3) - 1)], [[1000], 1000]]),
);
const seasonNight = game("night8", "2026-10-24", [[[1000], 2400], [[1000, 1000], 1500], [[1000], 300], [[1000, 1500], 0], [[1000], 3300]]);
const incognito = game("inc1", "2026-10-22", [[[1000], 400], [[1000], 1600], [[1000], 1000]], "incognito");
const tie = game("tie1", "2026-10-23", [[[1000], 1700], [[1000], 1700], [[1000], 0], [[1000], 600]]);
const twelve = game(
  "big12",
  "2026-10-25",
  [3100, 2000, 1500, 1200, 1000, 1000, 900, 700, 400, 200, 0, 0].map((out): [number[], number] => [[1000], out]),
);

const data: Data = {
  version: 1,
  settings: { presetBuyIns: [1000, 1500, 2000] },
  players: NAMES.map((name, i) => ({ id: `p${i}`, name, type: "regular", status: "active", createdAt: NOW })),
  seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
  games: [...earlier, seasonNight, incognito, tie, twelve],
  liveGame: null,
};

const SAMPLES: { label: string; game: Game }[] = [
  { label: "Season game (badges, leader)", game: seasonNight },
  { label: "Incognito", game: incognito },
  { label: "Tie for Man of the Match", game: tie },
  { label: "12 players, long name", game: twelve },
];

export function ResultsCardPreview() {
  const [urls, setUrls] = useState<(string | null)[]>(SAMPLES.map(() => null));
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      const { drawResultsCard } = await import("../lib/drawResultsCard.js");
      for (const [i, sample] of SAMPLES.entries()) {
        const blob = await drawResultsCard(resultsCardModel(data, sample.game));
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
      {SAMPLES.map((s, i) => (
        <figure key={s.label} className="m-0">
          {urls[i] ? (
            <img src={urls[i]!} alt={s.label} className="block h-auto w-full rounded-lg" width={1080} height={1350} />
          ) : (
            <div className="ct-panel aspect-[4/5]" />
          )}
          <figcaption className="ct-muted mt-1 text-xs">{s.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
