import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AwardsList, SectionLabel } from "../components/FunPanels.js";
import { StandingsList } from "../components/StandingsList.js";
import { SeasonRace } from "../components/SeasonRace.js";
import { SeasonPodium } from "../components/SeasonPodium.js";
import { Crown, EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { seasonAwards } from "../domain/fun.js";
import { champion, seasonStandings } from "../domain/standings.js";
import { seasonPodium } from "../domain/seasonShow.js";
import { useData } from "../state/DataContext.js";
import { useMe } from "../state/useMe.js";
import { seasonById } from "../lib/selectors.js";
import { seasonRace } from "../lib/seasonShow.js";
import { wrappedPlayers } from "../lib/wrappedEntry.js";
import { checkChampionCrown } from "../lib/celebrations.js";
import { motionReduced } from "../design/motion.js";
import { browserStore } from "../storage/localKeys.js";

// A closed season's champion. The crown drops in the first time this phone opens the season
// (ct51.seenChampion.<seasonId>), plain after that; with animations off it is simply shown.
function ChampionCard({ seasonId, name, net }: { seasonId: string; name: string; net: number }) {
  const [drop, setDrop] = useState(false);
  useEffect(() => {
    if (checkChampionCrown(seasonId, browserStore(), !motionReduced())) setDrop(true);
  }, [seasonId]);
  return (
    <div className="ct-panel ct-panel-brass mb-4 flex items-center gap-3 p-4">
      <span className={`shrink-0 ${drop ? "ct-crown-drop" : ""}`} onAnimationEnd={() => setDrop(false)}>
        <Crown className="block h-9 w-9" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="ct-eyebrow text-xs text-ink-muted">Champion</div>
        <div className="ct-display text-xl font-semibold break-words">{name}</div>
      </div>
      <Money value={net} className="shrink-0 text-lg" />
    </div>
  );
}

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
  const race = seasonRace(data, season.id);
  const podium = seasonPodium(data, season.id);
  // Season Wrapped (closed seasons): straight into your own story when this phone knows who you are.
  const wrapped = wrappedPlayers(data, season.id);
  const wrappedTo = wrapped.some((r) => r.playerId === me) ? `/seasons/${season.id}/wrapped/${me}` : `/seasons/${season.id}/wrapped`;

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle
        suit="♦"
        title={season.name}
        subtitle={season.status === "active" ? `Active since ${season.startedOn}` : `Closed ${season.endedOn ?? ""}`}
      />

      {championRow && <ChampionCard seasonId={season.id} name={championRow.name} net={championRow.net} />}

      {podium && (
        <section className="mb-4" aria-label={podium.final ? "Final podium" : "Podium so far"}>
          <SectionLabel>{podium.final ? "Final podium" : "Podium so far"}</SectionLabel>
          <div className="ct-panel overflow-hidden px-2 pt-2">
            <SeasonPodium key={season.id} podium={podium} />
          </div>
        </section>
      )}

      {wrapped.length > 0 && (
        <Link to={wrappedTo} className="ct-btn ct-btn-primary ct-focus mb-4 w-full">
          Season Wrapped
        </Link>
      )}

      {rows.length === 0 ? (
        <EmptyState suit="♣" title="No games in this season" />
      ) : (
        <StandingsList rows={rows} me={me} championId={championId} />
      )}

      {/* The race replay needs 2+ season games. Keyed by season so a new season starts fresh. */}
      {race.length >= 2 && (
        <section className="mt-6" aria-label="The race">
          <SectionLabel>The race</SectionLabel>
          <SeasonRace key={season.id} frames={race} />
        </section>
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
