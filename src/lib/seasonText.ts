import { champion, seasonStandings } from "../domain/standings.js";
import type { Data, Season } from "../domain/types.js";
import { formatSignedDollars } from "./format.js";

// Confirm wording for ending a season (Admin → Seasons): names the champion who'll be crowned (the
// current #1, computed, never stored) or says there's none.
export function crownLine(data: Data, season: Season): string {
  const id = champion(data, season.id);
  const top = id ? seasonStandings(data, season.id).find((r) => r.playerId === id) : undefined;
  return top
    ? `${top.name} (${formatSignedDollars(top.net)}) will be crowned ${season.name} champion.`
    : `No season games were played in ${season.name}, so there's no champion.`;
}

export const CANT_UNDO = "This can't be undone from the app.";
