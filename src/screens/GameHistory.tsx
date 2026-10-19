import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../state/DataContext.js";
import { allSeasonsNewestFirst, playerById, visibleGames } from "../lib/selectors.js";
import { gameResult } from "../domain/results.js";
import { formatDate, formatSignedDollars } from "../lib/format.js";
import type { Data } from "../domain/types.js";

function GameRow({ data, gameId }: { data: Data; gameId: string }) {
  const game = data.games.find((g) => g.id === gameId)!;
  return (
    <Link
      to={`/games/${game.id}`}
      className="block min-h-[48px] rounded border border-felt-700/20 p-3"
    >
      <div className="flex items-center justify-between text-sm">
        <span>{formatDate(game.date)}</span>
        <span className="flex gap-1">
          {game.mode === "incognito" && (
            <span className="rounded bg-chestnut-600/20 px-1.5 py-0.5 text-xs">Incognito</span>
          )}
          {game.editedAt && (
            <span className="rounded bg-felt-700/20 px-1.5 py-0.5 text-xs">Edited</span>
          )}
        </span>
      </div>
      <div className="mt-1 truncate text-sm text-felt-950/70 dark:text-white/70">
        {game.players
          .map((pid) => `${playerById(data, pid)?.name ?? pid} ${formatSignedDollars(gameResult(game, pid))}`)
          .join(" · ")}
      </div>
    </Link>
  );
}

export function GameHistory() {
  const { data, loading } = useData();
  const [seasonFilter, setSeasonFilter] = useState<string>("all");

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data) return <p className="p-4">No data.</p>;

  const seasons = allSeasonsNewestFirst(data);
  const games = visibleGames(data, seasonFilter === "all" ? undefined : seasonFilter);

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Game history</h1>

      {seasons.length > 0 && (
        <select
          className="mb-3 min-h-[48px] w-full rounded border border-felt-700/30 bg-transparent px-2"
          value={seasonFilter}
          onChange={(e) => setSeasonFilter(e.target.value)}
        >
          <option value="all">All seasons</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {games.length === 0 ? (
        <p>No games yet.</p>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => (
            <li key={g.id}>
              <GameRow data={data} gameId={g.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
