import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { useData } from "../state/DataContext.js";
import { activeSeason, playerById } from "../lib/selectors.js";
import { bestAndWorstGames, netWinningsOverTime } from "../domain/charts.js";
import { formatDate, formatSignedDollars } from "../lib/format.js";
import type { Data } from "../domain/types.js";

const tick = { fontSize: 11, style: { fill: "var(--ct-text-muted)" } };

function Stat({ label, children, to }: { label: string; children: ReactNode; to?: string }) {
  const body = (
    <>
      <span className="block text-[0.7rem] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="mt-1 block text-lg">{children}</span>
    </>
  );
  return to ? (
    <Link to={to} className="ct-panel ct-focus block p-3">
      {body}
    </Link>
  ) : (
    <div className="ct-panel p-3">{body}</div>
  );
}

function PlayerSeasonSection({ data, seasonId, playerId }: { data: Data; seasonId: string; playerId: string }) {
  const points = netWinningsOverTime(data, seasonId, playerId);
  const { best, worst } = bestAndWorstGames(data, seasonId, playerId);

  if (points.length === 0) {
    return (
      <EmptyState suit="♣" title="No games yet this season">
        Season games show up here once they're played.
      </EmptyState>
    );
  }

  const net = points[points.length - 1]!.net;

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Season">
          <Money value={net} animate />
        </Stat>
        <Stat label="Best" to={best ? `/games/${best.gameId}` : undefined}>
          {best ? <Money value={best.result} /> : "—"}
        </Stat>
        <Stat label="Worst" to={worst ? `/games/${worst.gameId}` : undefined}>
          {worst ? <Money value={worst.result} /> : "—"}
        </Stat>
      </div>

      <div className="ct-panel mb-4 p-3">
        <div className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Net winnings over the season</div>
        <div className="h-48 w-full text-brass">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={tick} stroke="currentColor" strokeOpacity={0.3} />
              <YAxis tick={tick} tickFormatter={(v) => formatSignedDollars(Number(v))} stroke="currentColor" strokeOpacity={0.3} width={58} />
              <Tooltip
                formatter={(value) => formatSignedDollars(Number(value))}
                labelFormatter={(label) => formatDate(String(label))}
                contentStyle={{
                  background: "var(--ct-felt-hi)",
                  border: "1px solid var(--ct-brass-lo)",
                  borderRadius: 12,
                  color: "var(--ct-text)",
                }}
                itemStyle={{ color: "var(--ct-brass)" }}
                labelStyle={{ color: "var(--ct-text-muted)" }}
              />
              <Line type="monotone" dataKey="net" name="Net" stroke="currentColor" strokeWidth={2.5} dot={{ r: 3, fill: "currentColor" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="ct-panel overflow-hidden">
        <ul>
          {points
            .slice()
            .reverse()
            .map((p) => (
              <li key={p.gameId}>
                <Link to={`/games/${p.gameId}`} className="ct-list-row ct-focus">
                  <span className="flex-1">{formatDate(p.date)}</span>
                  <Money value={p.result} />
                </Link>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

export function PlayerPage() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <Loading />;
  const player = data && id ? playerById(data, id) : undefined;
  if (!data || !id || !player) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="Player not found" />
      </div>
    );
  }

  const season = activeSeason(data);

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle
        suit="♥"
        title={player.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {season ? season.name : "No active season"}
            {player.type === "guest" && <span className="ct-tag">Guest</span>}
            {player.status === "archived" && <span className="ct-tag">Archived</span>}
          </span>
        }
      />
      {season ? (
        <PlayerSeasonSection data={data} seasonId={season.id} playerId={id} />
      ) : (
        <EmptyState suit="♠" title="No active season" />
      )}
    </div>
  );
}
