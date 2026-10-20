import type { ReactNode } from "react";
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

function standings(data: Data, me: string | null): ReactNode {
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
        <StandingsList rows={rows} me={me} changes={rankChanges(data, season.id)} lines={lines} />
      )}
    </>
  );
}

export function Leaderboard() {
  const { data, loading, error } = useData();
  const { me } = useMe();

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
          {standings(data, me)}
        </>
      )}
    </div>
  );
}
