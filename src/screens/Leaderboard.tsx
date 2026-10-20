import { useEffect, useState, type ReactNode } from "react";
import { HomeActions } from "../components/HomeActions.js";
import { LastNightCard } from "../components/LastNightCard.js";
import { StandingsList } from "../components/StandingsList.js";
import { EmptyState, Loading, PageTitle } from "../design/components.js";
import type { Data } from "../domain/types.js";
import { rankChanges } from "../domain/highlights.js";
import { seasonStandings } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { activeSeason, todaysLines, visibleGames } from "../lib/selectors.js";
import { useMe } from "../state/useMe.js";
import { checkLastSeenGame, latestSeasonGameId } from "../lib/lastSeenGame.js";
import { motionReduced } from "../design/motion.js";
import { browserStore } from "../storage/localKeys.js";

const PULSE_MS = 1200;

// Rank arrows pulse once when this phone sees a new season game for the first time (never on the very
// first visit, never twice for the same game). The key is updated even when animations are off.
function usePulseOnNewGame(data: Data | null): boolean {
  const season = data ? activeSeason(data) : undefined;
  const latest = data && season ? latestSeasonGameId(data, season.id) : null;
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (checkLastSeenGame(latest, browserStore()) && !motionReduced()) setPulse(true);
  }, [latest]);
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(false), PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulse]);
  return pulse;
}

function standings(data: Data, me: string | null, pulse: boolean): ReactNode {
  const season = activeSeason(data);
  if (!season) {
    return (
      <EmptyState suit="♠" title="No season yet">
        Ask the admin to start Season 1.
      </EmptyState>
    );
  }

  const rows = seasonStandings(data, season.id);
  const games = visibleGames(data, season.id).filter((g) => g.mode === "season").length;
  const lines = new Map([...todaysLines(data, season.id)].map(([id, t]) => [id, t.line]));

  return (
    <>
      <PageTitle
        suit="♠"
        title={season.name}
        subtitle={`${rows.length} player${rows.length === 1 ? "" : "s"} · ${games} game${games === 1 ? "" : "s"}`}
      />
      {rows.length === 0 ? (
        <EmptyState suit="♣" title="No players yet">
          The admin adds players before the first game.
        </EmptyState>
      ) : (
        <StandingsList rows={rows} me={me} changes={rankChanges(data, season.id)} lines={lines} morph pulse={pulse} />
      )}
    </>
  );
}

export function Leaderboard() {
  const { data, loading, error } = useData();
  const { me } = useMe();
  const pulse = usePulseOnNewGame(data);

  // The game buttons / "Game on" card come first in every state, so a game on this phone can always be
  // resumed, even offline before any data has loaded.
  return (
    <div className="px-4 pt-2 pb-4">
      <HomeActions data={data} />
      {loading && !data ? (
        <Loading />
      ) : !data ? (
        <EmptyState suit="♦" title="Couldn't load the table">
          {error ?? "Check your connection and tap refresh."}
        </EmptyState>
      ) : (
        <>
          <LastNightCard data={data} />
          {standings(data, me, pulse)}
        </>
      )}
    </div>
  );
}
