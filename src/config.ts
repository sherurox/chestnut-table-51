export const CONFIG = {
  owner: "sherurox",
  repo: "chestnut-table-51",
  branch: "main",
  dataPath: "data/data.json",
  appName: "Chestnut Table 51",
  shortName: "CT51",
};

// The History screen lists data commits from here on: the reset commit "Reset: wipe test data, start
// real Season 1" (CLAUDE.md §12). Older commits are test data; git history itself is not rewritten.
export const HISTORY_SINCE = "2026-10-20T04:11:01Z";

// Table tools step D (CLAUDE.md §5.2): a season holds at most this many finished season-mode games.
// Finishing the game that reaches it closes the season in the same commit.
export const MAX_SEASON_GAMES = 10;

// Table tools step C (CLAUDE.md §12): the club's chip box, smallest chip first. Buy-ins handed out in
// chips must be multiples of the smallest chip ($5). Box total: $9,500.
export type ChipColor = "white" | "red" | "green" | "blue" | "black";
export const CHIP_SET: readonly { color: ChipColor; value: number; count: number }[] = [
  { color: "white", value: 5, count: 100 },
  { color: "red", value: 10, count: 50 },
  { color: "green", value: 20, count: 50 },
  { color: "blue", value: 50, count: 50 },
  { color: "black", value: 100, count: 50 },
];

// Preferred per-player splits by buy-in, counts in CHIP_SET order. Other amounts are fitted to the shape
// of the nearest one (domain/chips.ts).
export const PREFERRED_SPLITS: Readonly<Record<number, readonly number[]>> = {
  1000: [10, 10, 10, 5, 4],
};
