import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useData } from "../state/DataContext.js";
import { activeSeason, playerById } from "../lib/selectors.js";
import { bestAndWorstGames, netWinningsOverTime } from "../domain/charts.js";
import { formatDate, formatSignedDollars } from "../lib/format.js";
import type { Data } from "../domain/types.js";

function PlayerSeasonSection({
  data,
  seasonId,
  playerId,
}: {
  data: Data;
  seasonId: string;
  playerId: string;
}) {
  const points = netWinningsOverTime(data, seasonId, playerId);
  const { best, worst } = bestAndWorstGames(data, seasonId, playerId);

  if (points.length === 0) {
    return <p className="mt-3 text-sm">No games yet this season.</p>;
  }

  return (
    <div className="mt-3">
      <div className="h-48 w-full text-chestnut-500">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip
              formatter={(value) => formatSignedDollars(Number(value))}
              labelFormatter={(label) => formatDate(String(label))}
            />
            <Line type="monotone" dataKey="net" stroke="currentColor" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex justify-between text-sm">
        {best && (
          <Link to={`/games/${best.gameId}`}>
            Best: <span className="text-win">{formatSignedDollars(best.result)}</span>
          </Link>
        )}
        {worst && (
          <Link to={`/games/${worst.gameId}`}>
            Worst: <span className="text-loss">{formatSignedDollars(worst.result)}</span>
          </Link>
        )}
      </div>

      <ul className="mt-3 divide-y divide-felt-700/20">
        {points
          .slice()
          .reverse()
          .map((p) => (
            <li key={p.gameId} className="flex min-h-[48px] items-center justify-between py-2">
              <Link to={`/games/${p.gameId}`}>{formatDate(p.date)}</Link>
              <span className={p.result > 0 ? "text-win" : p.result < 0 ? "text-loss" : ""}>
                {formatSignedDollars(p.result)}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function PlayerPage() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <p className="p-4">Loading…</p>;
  if (!data || !id) return <p className="p-4">Not found.</p>;

  const player = playerById(data, id);
  if (!player) return <p className="p-4">Player not found.</p>;

  const season = activeSeason(data);

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">{player.name}</h1>
      {!season ? (
        <p className="mt-3 text-sm">No active season.</p>
      ) : (
        <PlayerSeasonSection data={data} seasonId={season.id} playerId={id} />
      )}
    </div>
  );
}
