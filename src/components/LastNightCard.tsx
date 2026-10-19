import { Link } from "react-router-dom";
import { Crown, Money } from "../design/components.js";
import { latestFinishedGame, nightSummary, relativeNight } from "../domain/highlights.js";
import type { Data } from "../domain/types.js";
import { shareDate } from "../lib/share.js";

// Home (#/) recap of the most recent finished game, any mode. Taps through to its detail page.
export function LastNightCard({ data }: { data: Data }) {
  const game = latestFinishedGame(data);
  if (!game) return null;
  const { playerCount, winners, roughNight } = nightSummary(data, game);
  const label = relativeNight(game.date) ?? shareDate(game.date);

  return (
    <section aria-label="Last game" className="mb-4">
      <Link to={`/games/${game.id}`} className="ct-panel ct-focus flex min-h-[56px] flex-col gap-2 p-4">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="ct-display text-lg font-semibold">{label}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            {game.mode === "incognito" && <span className="ct-tag">♣ Incognito</span>}
            {playerCount} players
          </span>
        </span>
        {winners.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Crown className="h-5 w-5 shrink-0" />
            <span className="min-w-0 font-medium break-words">{winners.map((w) => w.name).join(" & ")}</span>
            <Money value={winners[0]!.result} />
          </span>
        )}
        {roughNight && (
          <span className="text-sm break-words text-ink-muted">
            Rough night: {roughNight.name}, {roughNight.rebuys === 0 ? "no rebuys" : `${roughNight.rebuys} rebuy${roughNight.rebuys === 1 ? "" : "s"}`},{" "}
            <Money value={roughNight.result} className="text-sm" />
          </span>
        )}
        <span className="self-end text-sm font-semibold text-brass">See the game ›</span>
      </Link>
    </section>
  );
}
