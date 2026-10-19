import { Link, useParams } from "react-router-dom";
import { useData } from "../state/DataContext.js";
import { gameById, playerById, seasonById } from "../lib/selectors.js";
import { finalStack, gameResult, totalBuyIns } from "../domain/results.js";
import { formatDate, formatDollars, formatSignedDollars } from "../lib/format.js";

export function GameDetail() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data || !id) return <p className="p-4">Not found.</p>;

  const game = gameById(data, id);
  if (!game) return <p className="p-4">Game not found.</p>;

  const season = seasonById(data, game.seasonId);

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">{formatDate(game.date)}</h1>
      <p className="mb-3 text-sm text-felt-950/60 dark:text-white/60">
        {season?.name ?? "Unknown season"} · {game.mode === "incognito" ? "Incognito" : "Season"}
        {game.editedAt && " · Edited"}
      </p>
      <ul className="divide-y divide-felt-700/20">
        {game.players.map((pid) => {
          const player = playerById(data, pid);
          const result = gameResult(game, pid);
          return (
            <li key={pid} className="flex min-h-[48px] items-center justify-between gap-2 py-2">
              <Link to={`/players/${pid}`} className="min-w-0 flex-1 truncate">
                {player?.name ?? pid}
              </Link>
              <span className="shrink-0 text-sm text-felt-950/60 dark:text-white/60">
                {formatDollars(totalBuyIns(game, pid))} → {formatDollars(finalStack(game, pid))}
              </span>
              <span
                className={`shrink-0 ${result > 0 ? "text-win" : result < 0 ? "text-loss" : ""}`}
              >
                {formatSignedDollars(result)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
