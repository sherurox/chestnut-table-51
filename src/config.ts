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
