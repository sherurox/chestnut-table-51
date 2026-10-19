import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createFirstSeason } from "../domain/adminOps.js";
import { startedSeasonMessage } from "../domain/commitMessages.js";
import { localIsoDate } from "../domain/dates.js";
import { newId } from "../domain/ids.js";
import type { Data, Game } from "../domain/types.js";
import { formatDate } from "../lib/format.js";
import { shareText } from "../lib/share.js";
import { useData } from "../state/DataContext.js";
import { logout } from "../storage/auth.js";
import { useLocalGame, useQueue } from "./localHooks.js";
import { useSync } from "./sync.js";
import { SaveStatus, btnPrimary, btnSecondary, muted, useSave } from "./ui.js";

function CreateFirstSeason() {
  const { save, saving, state } = useSave();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mb-4 rounded-lg border border-chestnut-400 p-4">
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
  return `${formatDate(`${game.date}T12:00:00`)} · ${mode} · ${game.players.length} players`;
}

// §9.8: plain text for the group chat. Falls back to a selectable box if the clipboard is blocked.
function ShareResults({ data, game }: { data: Data; game: Game }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const text = shareText(data, game);
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span>{gameLabel(game)}</span>
        <button
          type="button"
          className={btnSecondary}
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
          <textarea readOnly className="mt-1 w-full rounded-lg border border-felt-700 bg-transparent p-2 text-sm" rows={4} value={text} onFocus={(e) => e.target.select()} />
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
      <section className="mb-4">
        <h2 className="mb-1 font-semibold">
          Not synced
          {queue.length > 0 && (
            <span className="ml-2 rounded-full bg-chestnut-500 px-2 py-0.5 text-xs font-semibold text-white">{queue.length}</span>
          )}
        </h2>
        {queue.length === 0 ? (
          <p className={`text-sm ${muted}`}>Nothing waiting to sync.</p>
        ) : (
          <>
            <p className={`mb-2 text-sm ${muted}`}>Saved on this phone, not yet on GitHub. It's never dropped.</p>
            <ul className="mb-2 divide-y divide-felt-700/20">
              {queue.map((e) => (
                <li key={e.game.id} className="flex min-h-[48px] items-center">
                  {gameLabel(e.game)}
                </li>
              ))}
            </ul>
            <button type="button" className={btnPrimary} disabled={syncing} onClick={() => void syncNow()}>
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
        <section className="mb-4">
          <h2 className="mb-1 font-semibold">Saved</h2>
          <ul className="divide-y divide-felt-700/20">
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

  if (loading && !data) return <p className="p-4">Loading…</p>;

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Admin</h1>

      {data && data.seasons.length === 0 && <CreateFirstSeason />}

      <ul className="mb-4 divide-y divide-felt-700/20">
        <li>
          <Link to={local ? "/admin/live" : "/admin/start"} className="flex min-h-[48px] items-center font-semibold">
            {local ? "Resume game" : "Start game"}
          </Link>
        </li>
        <li>
          <Link to="/admin/players" className="flex min-h-[48px] items-center">
            Players
          </Link>
        </li>
        <li>
          <Link to="/admin/settings" className="flex min-h-[48px] items-center">
            Settings
          </Link>
        </li>
      </ul>

      <NotSynced />

      <button type="button" className={btnSecondary} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
