import { StandingsList } from "../components/StandingsList.js";
import { EmptyState, Loading, PageTitle } from "../design/components.js";
import { seasonStandings } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { activeSeason, visibleGames } from "../lib/selectors.js";
import { useMe } from "../state/useMe.js";

export function Leaderboard() {
  const { data, loading, error } = useData();
  const { me } = useMe();

  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="Couldn't load the table">
          {error ?? "Check your connection and tap refresh."}
        </EmptyState>
      </div>
    );
  }

  const season = activeSeason(data);
  if (!season) {
    return (
      <div className="p-4">
        <EmptyState suit="♠" title="No season yet">
          Ask the admin to start Season 1.
        </EmptyState>
      </div>
    );
  }

  const rows = seasonStandings(data, season.id);
  const games = visibleGames(data, season.id).filter((g) => g.mode === "season").length;

  return (
    <div className="px-4 pt-2 pb-4">
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
        <StandingsList rows={rows} me={me} />
      )}
    </div>
  );
}
