import { Link } from "react-router-dom";
import { champion } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { allSeasonsNewestFirst, playerById } from "../lib/selectors.js";

export function Seasons() {
  const { data, loading } = useData();

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data) return <p className="p-4">No data.</p>;

  const seasons = allSeasonsNewestFirst(data);

  if (seasons.length === 0) {
    return <p className="p-4">No seasons yet.</p>;
  }

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Seasons</h1>
      <ul className="divide-y divide-felt-700/20">
        {seasons.map((season) => {
          const championId = season.status === "closed" ? champion(data, season.id) : null;
          const championPlayer = championId ? playerById(data, championId) : null;
          return (
            <li key={season.id}>
              <Link
                to={`/seasons/${season.id}`}
                className="flex min-h-[48px] items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0 flex-1 truncate">{season.name}</span>
                {season.status === "active" ? (
                  <span className="shrink-0 text-xs text-chestnut-400">Active</span>
                ) : championPlayer ? (
                  <span className="shrink-0 text-sm">🏆 {championPlayer.name}</span>
                ) : (
                  <span className="shrink-0 text-xs text-felt-950/50 dark:text-white/50">No games</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
