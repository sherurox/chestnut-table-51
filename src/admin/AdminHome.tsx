import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loading, PageTitle } from "../design/components.js";
import { IconChevron } from "../design/icons.js";
import { createFirstSeason } from "../domain/adminOps.js";
import { startedSeasonMessage } from "../domain/commitMessages.js";
import { localIsoDate } from "../domain/dates.js";
import { deletedGames } from "../domain/gameEdits.js";
import { newId } from "../domain/ids.js";
import type { Data, Game } from "../domain/types.js";
import { formatDate } from "../lib/format.js";
import { shareText } from "../lib/share.js";
import { activeSeason } from "../lib/selectors.js";
import { useData } from "../state/DataContext.js";
import { logout } from "../storage/auth.js";
import { useLocalGame, useQueue } from "./localHooks.js";
import { useSync } from "./sync.js";
import { SaveStatus, btnPrimary, btnSecondary, muted, useSave } from "./ui.js";

function CreateFirstSeason() {
  const { save, saving, state } = useSave();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mb-4 ct-panel ct-panel-brass p-4">
      <h2 className="font-semibold">No seasons yet</h2>
      <p className={`mb-3 text-sm ${muted}`}>Create Season 1 to start tracking standings.</p>
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={saving}
            onClick={() =>
              save(
                createFirstSeason({ id: newId(), today: localIsoDate() }),
                startedSeasonMessage("Season 1"),
                "Season 1 started.",
              )
            }
          >
            Yes, start Season 1
          </button>
          <button type="button" className={btnSecondary} disabled={saving} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={btnPrimary} onClick={() => setConfirming(true)}>
          Create Season 1
        </button>
      )}
      <SaveStatus state={state} />
    </section>
  );
}

function gameLabel(game: Game): string {
  const mode = game.mode === "incognito" ? "Incognito" : "Season";
  return `${formatDate(game.date)} · ${mode} · ${game.players.length} players`;
}

// §9.8: plain text for the group chat. Falls back to a selectable box if the clipboard is blocked.
function ShareResults({ data, game }: { data: Data; game: Game }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const text = shareText(data, game);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{gameLabel(game)}</span>
        <button
          type="button"
          className={`${btnSecondary} whitespace-nowrap`}
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => setStatus("copied"))
              .catch(() => setStatus("manual"))
          }
        >
          {status === "copied" ? "Copied ✓" : "Share results"}
        </button>
      </div>
      {status === "manual" && (
        <label className="mt-2 block">
          <span className={`text-sm ${muted}`}>Couldn't copy automatically. Select and copy:</span>
          <textarea readOnly className="ct-input mt-1 h-auto py-2 text-sm" rows={4} value={text} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </li>
  );
}

function NotSynced() {
  const queue = useQueue();
  const { syncing, error, recent, syncNow } = useSync();

  return (
    <>
      <section className={`ct-panel mb-4 p-4 ${queue.length > 0 ? "ct-panel-brass" : ""}`}>
        <h2 className="ct-heading mb-1 text-lg">
          <span className="ct-suit ct-suit-red" aria-hidden="true">
            ♦
          </span>
          Not synced
          {queue.length > 0 && (
            <span className="ct-pill font-sans">{queue.length}</span>
          )}
        </h2>
        {queue.length === 0 ? (
          <p className={`text-sm ${muted}`}>Nothing waiting to sync.</p>
        ) : (
          <>
            <p className={`mb-2 text-sm ${muted}`}>Saved on this phone, not yet on GitHub. It's never dropped.</p>
            <ul className="mb-2 ct-divided">
              {queue.map((e) => (
                <li key={e.game.id} className="flex min-h-[48px] items-center">
                  {gameLabel(e.game)}
                </li>
              ))}
            </ul>
            <button type="button" className={`${btnPrimary} w-full`} disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-loss">
            {error}
          </p>
        )}
      </section>

      {recent.length > 0 && (
        <section className="ct-panel mb-4 p-4">
          <h2 className="ct-heading mb-1 text-lg">
            <span className="ct-suit" aria-hidden="true">
              ♣
            </span>
            Saved
          </h2>
          <ul className="ct-divided">
            {recent.map((s) => (
              <ShareResults key={s.entry.game.id} data={s.data} game={s.entry.game} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function AdminHome() {
  const { data, loading } = useData();
  const local = useLocalGame();
  const { syncNow } = useSync();

  useEffect(() => {
    void syncNow();
  }, [syncNow]);

  if (loading && !data) return <Loading />;
  const deletedCount = data ? deletedGames(data).length : 0;

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♠" title="Admin" subtitle="Run tonight's game, manage players and settings." />

      {data && data.seasons.length === 0 && <CreateFirstSeason />}

      {!local && data && data.seasons.length > 0 && !activeSeason(data) ? (
        <Link to="/admin/seasons" className={`${btnPrimary} mb-4 w-full text-lg`}>
          ♦ Start a new season first
        </Link>
      ) : (
        <Link to={local ? "/admin/live" : "/admin/start"} className={`${btnPrimary} mb-4 w-full text-lg`}>
          {local ? "♠ Resume game" : "♠ Start game"}
        </Link>
      )}

      <div className="ct-panel mb-4 overflow-hidden">
        <ul>
          <li>
            <Link to="/admin/players" className="ct-list-row ct-focus">
              <span className="flex-1">Players</span>
              <span className={muted}>
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/admin/seasons" className="ct-list-row ct-focus">
              <span className="flex-1">Seasons</span>
              <span className={muted}>
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/admin/deleted" className="ct-list-row ct-focus">
              <span className="flex-1">Deleted games</span>
              {deletedCount > 0 && <span className={`ct-num text-sm ${muted}`}>{deletedCount}</span>}
              <span className={muted}>
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/admin/settings" className="ct-list-row ct-focus">
              <span className="flex-1">Settings</span>
              <span className={muted}>
                <IconChevron />
              </span>
            </Link>
          </li>
        </ul>
      </div>

      <NotSynced />

      <button type="button" className={`${btnSecondary} w-full`} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
