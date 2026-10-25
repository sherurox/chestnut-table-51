import { SeasonPodium } from "../components/SeasonPodium.js";
import { SeasonRace } from "../components/SeasonRace.js";
import { TrophyCabinet } from "../components/TrophyCabinet.js";
import { initials, type SeasonPodium as Podium, type Trophy } from "../domain/seasonShow.js";
import type { Data, Game } from "../domain/types.js";
import { seasonRace } from "../lib/seasonShow.js";

// DEV ONLY (#/style): Season show previews (the race, the podium, the trophy cabinet) on made-up seasons, with the real components.
const NOW = "2026-10-24T21:00:00.000Z";
const NAMES = [
  "Shreyas",
  "Rohan",
  "Venkataramanan Subramaniam",
  "Andhar",
  "Kabir",
  "Ishaan Chattopadhyay-Banerjee",
  "Dev",
  "Neel",
  "Arjun",
  "Tanmay",
  "Om",
  "Amit",
];

// results: one net result per player index (must sum to 0); everyone buys in $1,000.
function game(n: number, seasonId: string, results: number[]): Game {
  const date = `2026-10-${String(10 + n).padStart(2, "0")}`;
  const players = results.map((_, i) => `p${i}`);
  return {
    id: `${seasonId}-g${n}`,
    seasonId,
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((player) => ({ player, amount: 1000, at: NOW })),
    cashOuts: results.map((r, i) => ({ player: `p${i}`, amount: 1000 + r })),
    createdAt: `${date}T21:00:00.000Z`,
  };
}

const big = [
  [800, 400, -200, -300, 100, -500, 0, 200, -100, -200, 100, -300],
  [-600, 900, 300, 200, -400, 100, -300, 0, 200, -100, -200, -100],
  [300, -500, 1200, -200, 0, -100, 100, -300, -200, 300, -400, -200],
  [-200, 300, -600, 900, 500, -100, -400, 200, -300, 100, 0, -400],
  [500, -300, 200, -400, -500, 1300, -200, -100, 0, -300, 200, -400],
];
const pair = [
  [500, -500],
  [-800, 800],
  [0, 0],
];

const data: Data = {
  version: 1,
  settings: { presetBuyIns: [1000] },
  players: NAMES.map((name, i) => ({ id: `p${i}`, name, type: "regular", status: "active", createdAt: NOW })),
  seasons: [
    { id: "big", name: "Twelve players", status: "active", startedOn: "2026-10-01" },
    { id: "pair", name: "Two players", status: "closed", startedOn: "2026-10-01", endedOn: "2026-10-20" },
  ],
  games: [
    ...big.map((r, n) => game(n + 1, "big", r)),
    ...pair.map((r, n) => game(n + 1, "pair", r)),
  ],
  liveGame: null,
};
// Late joiners: game 1 has only the first eight players.
data.games[0] = game(1, "big", [800, 400, -200, -300, 100, -500, -100, -200]);

export function SeasonRacePreview() {
  return (
    <div className="space-y-4">
      <SeasonRace frames={seasonRace(data, "big")} />
      <SeasonRace frames={seasonRace(data, "pair")} />
    </div>
  );
}

function podium(final: boolean, people: [string, number][]): Podium {
  return {
    final,
    places: people.map(([name, net], i) => ({ place: (i + 1) as 1 | 2 | 3, playerId: `x${i}`, name, initials: initials(name), net })),
  };
}

export function SeasonPodiumPreview() {
  const shows: [string, Podium][] = [
    ["Final, three long names", podium(true, [["Venkataramanan Subramaniam", 4850], ["Ishaan Chattopadhyay-Banerjee", 1200], ["Shreyas Khandale", -150]])],
    ["So far, two places", podium(false, [["Rohan", 800], ["Andhar", -800]])],
    ["One place", podium(false, [["Kabir", 0]])],
  ];
  return (
    <div className="space-y-4">
      {shows.map(([label, p]) => (
        <div key={label}>
          <p className="mb-1 text-xs text-ink-muted">{label}</p>
          <div className="ct-panel overflow-hidden px-2 pt-2">
            <SeasonPodium podium={p} />
          </div>
        </div>
      ))}
    </div>
  );
}

const TROPHIES: Trophy[] = [
  { seasonId: "s5", seasonName: "Diwali Cup 2027", kind: "gold", net: 4850 },
  { seasonId: "s4", seasonName: "Season 4", kind: "bronze", net: -300 },
  { seasonId: "s4", seasonName: "Season 4", kind: "spoon", net: -300 },
  { seasonId: "s3", seasonName: "Monsoon Masters Invitational", kind: "silver", net: 1200 },
  { seasonId: "s2", seasonName: "Season 2", kind: "spoon", net: -2350 },
];

export function TrophyCabinetPreview() {
  return (
    <div className="space-y-2">
      <TrophyCabinet trophies={TROPHIES} />
      <TrophyCabinet trophies={[]} />
    </div>
  );
}
