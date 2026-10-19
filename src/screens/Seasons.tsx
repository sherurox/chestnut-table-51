import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Crown, EmptyState, Loading, PageTitle } from "../design/components.js";
import { IconChevron } from "../design/icons.js";
import { champion } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { allSeasonsNewestFirst, playerById } from "../lib/selectors.js";

export function Seasons() {
  const { data, loading } = useData();

  if (loading && !data) return <Loading />;
  const seasons = data ? allSeasonsNewestFirst(data) : [];

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Seasons" subtitle="Everyone starts each season at $0." />
      {!data || seasons.length === 0 ? (
        <EmptyState suit="♠" title="No seasons yet">
          The admin starts Season 1 from the admin screen.
        </EmptyState>
      ) : (
        <div className="ct-panel overflow-hidden">
          <ul>
            {seasons.map((season, i) => {
              const championId = season.status === "closed" ? champion(data, season.id) : null;
              const championPlayer = championId ? playerById(data, championId) : null;
              return (
                <li key={season.id} className="ct-rise" style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                  <Link to={`/seasons/${season.id}`} className="ct-list-row ct-focus">
                    <span className="min-w-0 flex-1">
                      <span className="ct-display block text-lg font-semibold">{season.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {season.status === "active" ? `Since ${season.startedOn}` : `${season.startedOn} – ${season.endedOn ?? ""}`}
                      </span>
                    </span>
                    {season.status === "active" ? (
                      <span className="ct-tag ct-tag-brass">Active</span>
                    ) : championPlayer ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <Crown className="h-5 w-5" />
                        {championPlayer.name}
                      </span>
                    ) : (
                      <span className="ct-tag">No games</span>
                    )}
                    <span className="text-ink-muted">
                      <IconChevron />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
