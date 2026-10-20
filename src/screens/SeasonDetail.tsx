import { useParams } from "react-router-dom";
import { AwardsList, SectionLabel } from "../components/FunPanels.js";
import { StandingsList } from "../components/StandingsList.js";
import { Crown, EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { seasonAwards } from "../domain/fun.js";
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
  const awards = seasonAwards(data, season.id);
  const anyAward = Object.values(awards).some((a) => a !== null);

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

      {/* Awards need season games; a season with none shows only the empty state above. */}
      {rows.some((r) => r.gamesPlayed > 0) ? (
        <section className="mt-6" aria-label="Awards">
          <SectionLabel>{season.status === "closed" ? "Awards · final" : "Awards · so far"}</SectionLabel>
          {anyAward ? (
            <AwardsList data={data} awards={awards} />
          ) : (
            <p className="ct-panel p-4 text-sm text-ink-muted">No awards yet. They need a few more games.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
