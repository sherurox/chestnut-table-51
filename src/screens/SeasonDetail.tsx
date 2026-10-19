import { useParams } from "react-router-dom";
import { StandingsList } from "../components/StandingsList.js";
import { Crown, EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { champion, seasonStandings } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { useMe } from "../state/useMe.js";
import { seasonById } from "../lib/selectors.js";

export function SeasonDetail() {
  const { id } = useParams();
  const { data, loading } = useData();
  const { me } = useMe();

  if (loading && !data) return <Loading />;
  const season = data && id ? seasonById(data, id) : undefined;
  if (!data || !season) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="Season not found" />
      </div>
    );
  }

  const rows = seasonStandings(data, season.id);
  const championId = season.status === "closed" ? champion(data, season.id) : null;
  const championRow = rows.find((r) => r.playerId === championId);

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle
        suit="♦"
        title={season.name}
        subtitle={season.status === "active" ? `Active since ${season.startedOn}` : `Closed ${season.endedOn ?? ""}`}
      />

      {championRow && (
        <div className="ct-panel ct-panel-brass mb-4 flex items-center gap-3 p-4">
          <Crown className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Champion</div>
            <div className="ct-display text-xl font-semibold break-words">{championRow.name}</div>
          </div>
          <Money value={championRow.net} className="shrink-0 text-lg" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState suit="♣" title="No games in this season" />
      ) : (
        <StandingsList rows={rows} me={me} championId={championId} />
      )}
    </div>
  );
}
