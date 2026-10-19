import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import type { Data } from "../domain/types.js";
import { formatDollars } from "../lib/format.js";
import { formatElapsed, formatStarted, localGameSummary, otherPhoneGame, startGamePath } from "../lib/homeActions.js";
import { browserStore, LIVE_GAME_KEY, subscribeLocalChange } from "../storage/localKeys.js";

function rawLiveGame(): string | null {
  try {
    return browserStore()?.getItem(LIVE_GAME_KEY) ?? null;
  } catch {
    return null;
  }
}

// Ticks once a minute while mounted; the card only shows whole minutes.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function ResumeCard({ startedAt, total }: { startedAt: string; total: number }) {
  const now = useNow();
  return (
    <Link to="/admin/live" className="ct-panel ct-panel-brass ct-focus flex min-h-[56px] flex-col gap-1 p-4">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="ct-pill">♠ Game on</span>
        <span className="text-sm text-ink-muted">
          Started {formatStarted(startedAt, new Date(now))} · <span className="ct-num">{formatElapsed(startedAt, now)}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <span className="text-sm text-ink-muted">Table total </span>
          <span className="ct-num text-xl font-semibold">{formatDollars(total)}</span>
        </span>
        <span className="font-semibold text-brass">Back to the game ›</span>
      </span>
    </Link>
  );
}

// Home (#/) game buttons, on every phone. Tapping one opens Start, which shows the admin login gate
// first when needed. A game on this phone replaces them with a "Game on" card (no login needed, §9.6).
export function HomeActions({ data }: { data: Data | null }) {
  const raw = useSyncExternalStore(subscribeLocalChange, rawLiveGame, rawLiveGame);
  const local = useMemo(() => localGameSummary(raw), [raw]);
  const other = otherPhoneGame(data, local);

  if (local) {
    return (
      <section aria-label="Game in progress" className="mb-4">
        <ResumeCard startedAt={local.startedAt} total={local.tableTotal} />
      </section>
    );
  }

  return (
    <section aria-label="Start a game" className="mb-4 flex flex-col gap-2">
      {other && (
        <p role="note" className="ct-panel px-3 py-2 text-sm">
          A game is in progress on another phone (started {formatStarted(other.startedAt, new Date())})
        </p>
      )}
      <Link to={startGamePath("season")} className="ct-btn ct-btn-primary ct-focus w-full text-lg">
        ♠ New season game
      </Link>
      <Link to={startGamePath("incognito")} className="ct-btn ct-btn-offbook ct-focus w-full flex-col gap-0">
        <span>Incognito game</span>
        <span className="text-xs font-normal text-ink-muted">Off the books — doesn't count toward the season</span>
      </Link>
    </section>
  );
}
