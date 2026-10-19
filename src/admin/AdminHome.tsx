import { useState } from "react";
import { Link } from "react-router-dom";
import { createFirstSeason } from "../domain/adminOps.js";
import { startedSeasonMessage } from "../domain/commitMessages.js";
import { localIsoDate } from "../domain/dates.js";
import { newId } from "../domain/ids.js";
import { useData } from "../state/DataContext.js";
import { logout } from "../storage/auth.js";
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

export function AdminHome() {
  const { data, loading } = useData();

  if (loading && !data) return <p className="p-4">Loading…</p>;

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Admin</h1>

      {data && data.seasons.length === 0 && <CreateFirstSeason />}

      <ul className="mb-4 divide-y divide-felt-700/20">
        <li className={`flex min-h-[48px] items-center ${muted}`}>Start game — coming in Phase 4</li>
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

      <section className="mb-4">
        <h2 className="mb-1 font-semibold">Not synced</h2>
        <p className={`text-sm ${muted}`}>Nothing waiting to sync.</p>
      </section>

      <button type="button" className={btnSecondary} onClick={logout}>
        Log out
      </button>
    </div>
  );
}
