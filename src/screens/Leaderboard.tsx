import { Link } from "react-router-dom";
import { seasonStandings } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { activeSeason } from "../lib/selectors.js";
import { formatSignedDollars } from "../lib/format.js";
import { useMe } from "../state/useMe.js";

export function Leaderboard() {
  const { data, loading, error } = useData();
  const { me } = useMe();

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data) return <p className="p-4">{error ?? "Couldn't load data."}</p>;

  const season = activeSeason(data);
  if (!season) {
    return <p className="p-4">No season yet. Ask the admin to start Season 1.</p>;
  }

  const rows = seasonStandings(data, season.id);

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">{season.name}</h1>
      {rows.length === 0 ? (
        <p>No players yet.</p>
      ) : (
        <ol className="divide-y divide-felt-700/20">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex min-h-[48px] items-center gap-2 py-2">
              <span className="w-6 shrink-0 text-sm text-felt-950/60 dark:text-white/50">{i + 1}</span>
              <Link to={`/players/${row.playerId}`} className="min-w-0 flex-1 truncate">
                {row.name}
                {row.playerId === me && <span className="ml-1 text-xs text-chestnut-400">(You)</span>}
              </Link>
              <span className="shrink-0 text-sm text-felt-950/60 dark:text-white/50">
                {row.gamesPlayed}g
              </span>
              <span
                className={`shrink-0 ${row.net > 0 ? "text-win" : row.net < 0 ? "text-loss" : ""}`}
              >
                {formatSignedDollars(row.net)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
