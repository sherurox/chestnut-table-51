import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HomeActions } from "../components/HomeActions.js";
import { InstallHint } from "../components/InstallHint.js";
import { LastNightCard } from "../components/LastNightCard.js";
import { StandingsList } from "../components/StandingsList.js";
import { Crown, EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { Link } from "react-router-dom";
import type { Data } from "../domain/types.js";
import { latestFinishedGame, rankChanges } from "../domain/highlights.js";
import { champion, seasonStandings } from "../domain/standings.js";
import { useData } from "../state/DataContext.js";
import { activeSeason, allSeasonsNewestFirst, todaysLines } from "../lib/selectors.js";
import { useMe } from "../state/useMe.js";
import { checkNewGame, latestSeasonGame } from "../lib/lastSeenGame.js";
import { seasonProgress } from "../lib/seasonText.js";
import { motionReduced } from "../design/motion.js";
import { newGameCelebration } from "../lib/celebrations.js";
import { browserStore } from "../storage/localKeys.js";
import { playSound } from "../lib/sound.js";

const PULSE_MS = 1200;

// One new-game signal for Home: when this phone sees a season game created after every game it has seen
// before (never on the very first visit, never twice, never for an edit, delete or restore) the rank
// arrows pulse once and confetti bursts over the "Last night" card (only when the card is showing that
// game, not a newer incognito one). It is read once, before the watermark is updated, and the watermark
// is updated even when animations are off.
function useNewGameCelebration(data: Data | null): { pulse: boolean; confetti: boolean; confettiDone: () => void } {
  const season = data ? activeSeason(data) : undefined;
  const latestGame = data && season ? latestSeasonGame(data, season.id) : null;
  const latest = latestGame?.id ?? null;
  const cardGameId = data ? (latestFinishedGame(data)?.id ?? null) : null;
  const [pulse, setPulse] = useState(false);
  const [confetti, setConfetti] = useState(false);
  useEffect(() => {
    if (!data) return;
    const createdAtOf = (id: string) => data.games.find((g) => g.id === id)?.createdAt ?? null;
    const isNew = checkNewGame(latestGame, browserStore(), createdAtOf);
    const play = newGameCelebration(isNew, !motionReduced(), latest, cardGameId);
    if (play.pulse) setPulse(true);
    if (play.confetti) setConfetti(true);
    // The ta-da goes with the confetti, but follows the Sounds setting, not Animations.
    if (newGameCelebration(isNew, true, latest, cardGameId).confetti) playSound("win");
  }, [data, latestGame, latest, cardGameId]);
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(false), PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulse]);
  const confettiDone = useCallback(() => setConfetti(false), []);
  return { pulse, confetti, confettiDone };
}

// The last season was ended and no new one has started yet (§5.2): its final standings and champion.
function seasonOver(data: Data, me: string | null): ReactNode {
  const last = allSeasonsNewestFirst(data)[0]!;
  const rows = seasonStandings(data, last.id);
  const championId = champion(data, last.id);
  const top = rows.find((r) => r.playerId === championId);
  return (
    <>
      <PageTitle suit="♠" title={`${last.name} is over`} subtitle="The next season hasn't started yet." />
      {top && (
        <div className="ct-panel ct-panel-brass mb-4 flex items-center gap-3 p-4">
          <Crown className="block h-8 w-8 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink-muted">Champion</span>
            <span className="block font-semibold break-words">{top.name}</span>
          </span>
          <Money value={top.net} className="font-semibold" />
        </div>
      )}
      {rows.length > 0 && <StandingsList rows={rows} me={me} championId={championId} />}
      <Link to={`/seasons/${last.id}`} className="ct-btn ct-btn-secondary ct-focus mt-4 w-full">
        Final standings and games
      </Link>
    </>
  );
}

function standings(data: Data, me: string | null, pulse: boolean): ReactNode {
  const season = activeSeason(data);
  if (!season && data.seasons.length > 0) return seasonOver(data, me);
  if (!season) {
    return (
      <EmptyState suit="♠" title="No season yet">
        Ask the admin to start Season 1.
      </EmptyState>
    );
  }

  const rows = seasonStandings(data, season.id);
  const lines = new Map([...todaysLines(data, season.id)].map(([id, t]) => [id, t.line]));

  return (
    <>
      <PageTitle
        suit="♠"
        title={season.name}
        subtitle={`${rows.length} player${rows.length === 1 ? "" : "s"} · ${seasonProgress(data, season.id)}`}
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
  const { pulse, confetti, confettiDone } = useNewGameCelebration(data);

  // The game buttons / "Game on" card come first in every state, so a game on this phone can always be
  // resumed, even offline before any data has loaded.
  return (
    <div className="px-4 pt-2 pb-4">
      <HomeActions data={data} />
      <InstallHint />
      {loading && !data ? (
        <Loading />
      ) : !data ? (
        <EmptyState suit="♦" title="Couldn't load the table">
          {error ?? "Check your connection and tap refresh."}
        </EmptyState>
      ) : (
        <>
          <LastNightCard data={data} confetti={confetti} onConfettiDone={confettiDone} />
          {standings(data, me, pulse)}
        </>
      )}
    </div>
  );
}
