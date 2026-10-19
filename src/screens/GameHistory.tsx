import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { useData } from "../state/DataContext.js";
import { allSeasonsNewestFirst, playerById, visibleGames } from "../lib/selectors.js";
import { gameResult } from "../domain/results.js";
import { formatDate } from "../lib/format.js";
import type { Data, Game } from "../domain/types.js";

function GameCard({ data, game, index }: { data: Data; game: Game; index: number }) {
  const results = game.players
    .map((pid) => ({ pid, name: playerById(data, pid)?.name ?? pid, result: gameResult(game, pid) }))
    .sort((a, b) => b.result - a.result || a.name.localeCompare(b.name));
  return (
    <Link
      to={`/games/${game.id}`}
      className="ct-panel ct-focus ct-rise block p-3"
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="ct-display text-lg font-semibold">{formatDate(game.date)}</span>
        <span className="flex gap-1.5">
          {game.mode === "incognito" && <span className="ct-tag">♣ Incognito</span>}
          {game.editedAt && <span className="ct-tag ct-tag-brass">Edited</span>}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {results.map((r) => (
          <li key={r.pid} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 break-words">{r.name}</span>
            <Money value={r.result} className="shrink-0 text-sm" />
          </li>
        ))}
      </ul>
    </Link>
  );
}

export function GameHistory() {
  const { data, loading } = useData();
  const [seasonFilter, setSeasonFilter] = useState<string>("all");

  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="No data yet" />
      </div>
    );
  }

  const seasons = allSeasonsNewestFirst(data);
  const games = visibleGames(data, seasonFilter === "all" ? undefined : seasonFilter);

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♣" title="Game history" subtitle="Newest first. Incognito games never count toward standings." />

      {seasons.length > 0 && (
        <div className="mb-4">
          <label htmlFor="season-filter" className="ct-label">
            Season
          </label>
          <select id="season-filter" className="ct-input" value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
            <option value="all">All seasons</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {games.length === 0 ? (
        <EmptyState suit="♣" title="No games yet">
          Finished games show up here.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {games.map((g, i) => (
            <li key={g.id}>
              <GameCard data={data} game={g} index={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
