import { Link, useParams } from "react-router-dom";
import { champion, seasonStandings } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { seasonById } from "../lib/selectors.js";
import { formatSignedDollars } from "../lib/format.js";

export function SeasonDetail() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data || !id) return <p className="p-4">Not found.</p>;

  const season = seasonById(data, id);
  if (!season) return <p className="p-4">Season not found.</p>;

  const rows = seasonStandings(data, season.id);
  const championId = season.status === "closed" ? champion(data, season.id) : null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">{season.name}</h1>
      <p className="mb-3 text-sm text-felt-950/60 dark:text-white/60">
        {season.status === "active" ? "Active" : `Closed ${season.endedOn ?? ""}`}
      </p>

      {rows.length === 0 ? (
        <p>No games yet.</p>
      ) : (
        <ol className="divide-y divide-felt-700/20">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex min-h-[48px] items-center gap-2 py-2">
              <span className="w-6 shrink-0 text-sm text-felt-950/60 dark:text-white/50">{i + 1}</span>
              <Link to={`/players/${row.playerId}`} className="min-w-0 flex-1 truncate">
                {row.name}
                {row.playerId === championId && " 🏆"}
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
