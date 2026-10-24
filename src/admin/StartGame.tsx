import { Loading, PageTitle } from "../design/components.js";
import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { clearedLiveGameMessage } from "../domain/commitMessages.js";
import { localIsoDate } from "../domain/dates.js";
import { newId } from "../domain/ids.js";
import { clearMarkerChange, guestsNeedingChoice, lastGamePlayers, startGame, type GuestChoice } from "../domain/liveGame.js";
import { seasonFullMessage, seasonIsFull } from "../domain/seasonLimit.js";
import type { Game, ID } from "../domain/types.js";
import { formatDateTime } from "../lib/format.js";
import { startModeFromSearch } from "../lib/homeActions.js";
import { isIos, isStandalone } from "../lib/platform.js";
import { activeSeason } from "../lib/selectors.js";
import { useData } from "../state/DataContext.js";
import { saveLocalGame } from "../storage/localGame.js";
import { useLocalGame } from "./localHooks.js";
import { useSync } from "./sync.js";
import { ConfirmButton, SaveStatus, btnPrimary, btnSecondary, input, muted, useSave } from "./ui.js";

function IosHint() {
  if (!isIos() || isStandalone()) return null;
  return (
    <p role="note" className="mb-3 ct-panel ct-panel-brass px-3 py-2 text-sm">
      Run games from the CT51 home-screen app, not Safari.
    </p>
  );
}

// §9.3: someone else's (or a stuck) game blocks starting until it is cleared.
function GameInProgress({ gameId, startedAt }: { gameId: ID; startedAt: string }) {
  const { save, saving, state } = useSave();
  return (
    <section role="alert" className="mb-4 ct-panel ct-panel-brass p-4">
      <p className="mb-1 font-semibold">A game is already in progress (started {formatDateTime(startedAt)})</p>
      <p className={`mb-3 text-sm ${muted}`}>
        It isn't on this phone. If it was abandoned or its phone is lost, clear it to start a new one.
      </p>
      <ConfirmButton
        label="Clear stuck game"
        prompts={["Clear the game in progress? Anything only on the other phone won't be saved here."]}
        confirmLabel="Yes, clear it"
        disabled={saving}
        onConfirm={() => void save(clearMarkerChange(gameId), clearedLiveGameMessage(), "Cleared. You can start a new game.")}
      />
      <SaveStatus state={state} />
    </section>
  );
}

export function StartGame() {
  const { data } = useData();
  const local = useLocalGame();
  const { syncNow } = useSync();
  const navigate = useNavigate();
  const { search: query } = useLocation();
  const [selected, setSelected] = useState<ID[]>([]);
  const [search, setSearch] = useState("");
  // Preselected by the Home buttons (`?mode=season` / `?mode=incognito`); still changeable here.
  const [pickedMode, setMode] = useState<Game["mode"]>(() => startModeFromSearch(query));
  const [date, setDate] = useState(() => localIsoDate());
  const [askGuests, setAskGuests] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(
    () =>
      (data?.players ?? [])
        .filter((p) => p.status === "active")
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [data],
  );

  if (local) return <Navigate to="/admin/live" replace />;
  if (!data) return <Loading />;

  const season = activeSeason(data);
  if (!season) {
    // No active season (none yet, or the last one was ended): no games of either mode (§5.2).
    const ended = data.seasons.length > 0;
    return (
      <div className="p-4">
        <p className="mb-3">{ended ? "Start a new season first." : "Create a season before starting a game."}</p>
        <Link to={ended ? "/admin/seasons" : "/admin"} className={`${ended ? btnPrimary : btnSecondary} inline-flex items-center`}>
          {ended ? "Go to Seasons" : "Back to admin"}
        </Link>
      </div>
    );
  }
  if (data.liveGame) {
    return (
      <div className="p-4">
        <PageTitle suit="♠" title="Start game" />
        <GameInProgress gameId={data.liveGame.gameId} startedAt={data.liveGame.startedAt} />
      </div>
    );
  }

  // A full season takes only incognito games until the admin ends it (§5.2).
  const full = seasonIsFull(data, season.id);
  const mode: Game["mode"] = full ? "incognito" : pickedMode;
  const nameOf = (id: ID) => data.players.find((p) => p.id === id)?.name ?? id;
  const guests = guestsNeedingChoice(data, selected, mode);
  const last = lastGamePlayers(data);
  const q = search.trim().toLowerCase();
  const visible = q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;

  function toggle(id: ID) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function begin(guestChoice: GuestChoice | null) {
    try {
      const game = startGame(data!, {
        id: newId(),
        playerIds: selected,
        mode,
        guestChoice,
        date,
        now: new Date().toISOString(),
      });
      saveLocalGame(game);
      navigate("/admin/live");
      void syncNow(); // writes the live marker; if offline, it's retried later (§9.2)
    } catch (err) {
      setAskGuests(false);
      setError(err instanceof Error ? err.message : "Couldn't start the game.");
    }
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♠" title="Start game" />
      <IosHint />

      <fieldset className="mb-4 flex gap-2">
        <legend className="ct-label">Mode</legend>
        {(["season", "incognito"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            disabled={m === "season" && full}
            onClick={() => setMode(m)}
            className={`${btnSecondary} ct-choice flex-1`}
          >
            {m === "season" ? season.name : "Incognito"}
          </button>
        ))}
      </fieldset>
      {full && (
        <div role="note" className="-mt-2 mb-4 ct-panel ct-panel-brass px-3 pt-2 text-sm">
          <p>{seasonFullMessage(season)}. Incognito games are still fine.</p>
          <Link to="/admin/seasons" className="ct-focus flex min-h-[48px] items-center font-semibold underline">
            Go to Seasons
          </Link>
        </div>
      )}

      <label className="mb-4 flex flex-col">
        <span className="ct-label">Date</span>
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <h2 className="ct-heading mb-2 text-lg">
        <span className="ct-suit" aria-hidden="true">
          ♣
        </span>
        Players <span className="font-sans text-sm font-normal text-ink-muted">({selected.length} picked)</span>
      </h2>
      {last.length > 0 && (
        <button type="button" className={`${btnSecondary} mb-2 w-full`} onClick={() => setSelected(last)}>
          Same players as last game
        </button>
      )}
      <label className="mb-2 block">
        <span className="sr-only">Search players</span>
        <input
          className={input}
          type="search"
          placeholder="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </label>
      {players.length === 0 ? (
        <p className={`py-2 text-sm ${muted}`}>
          No players yet. <Link to="/admin/players" className="underline">Add players</Link> first.
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {visible.map((p) => {
            const on = selected.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={`${btnSecondary} ct-choice flex w-full items-center justify-between text-left`}
                >
                  <span>
                    {on ? "✓ " : ""}
                    {p.name}
                  </span>
                  {p.type === "guest" && <span className="text-xs opacity-70">Guest</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className={`mb-3 text-sm ${muted}`}>
        Someone new?{" "}
        <Link to="/admin/players" className="ct-focus inline-flex min-h-[48px] items-center align-middle underline">
          Add them on the Players screen
        </Link>
        , then come back.
      </p>

      {askGuests ? (
        <section role="dialog" aria-label="Guests in this game" className="ct-panel ct-panel-brass p-4">
          <p className="mb-1 font-semibold">This game has guests: {guests.map(nameOf).join(", ")}</p>
          <p className={`mb-3 text-sm ${muted}`}>Add them to {season.name} as regulars, or keep this game incognito.</p>
          <div className="flex flex-col gap-2">
            <button type="button" className={btnPrimary} onClick={() => begin("promote")}>
              Add {guests.length === 1 ? "guest" : "guests"} to {season.name}
            </button>
            <button type="button" className={btnSecondary} onClick={() => begin("incognito")}>
              Keep this game incognito
            </button>
            <button type="button" className={btnSecondary} onClick={() => setAskGuests(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className={`${btnPrimary} w-full`}
          disabled={selected.length < 2 || !date}
          onClick={() => (guests.length > 0 ? setAskGuests(true) : begin(null))}
        >
          {selected.length < 2 ? "Pick at least 2 players" : `Start game with ${selected.length} players`}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
