import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { discardedLiveGameMessage } from "../domain/commitMessages.js";
import {
  addBuyIn,
  addLatePlayer,
  clearMarkerChange,
  lateNeedsGuestChoice,
  liveState,
  parseStack,
  playerTotal,
  removePlayer,
  tableTotal,
  undo,
  type GuestChoice,
  type LiveAction,
  type LocalGame,
} from "../domain/liveGame.js";
import type { Data, ID } from "../domain/types.js";
import { formatDate, formatDollars } from "../lib/format.js";
import { useData } from "../state/DataContext.js";
import { isLoggedIn } from "../storage/auth.js";
import { saveChange } from "../storage/githubWrite.js";
import { clearLocalGame } from "../storage/localGame.js";
import { useGameUpdater, useLocalGame } from "./localHooks.js";
import { ConfirmButton, btnDanger, btnPrimary, btnSecondary, input, muted, useLoggedIn } from "./ui.js";

const FALLBACK_PRESETS = [1000, 1500, 2000];
const bigBtn =
  "min-h-[56px] rounded-lg bg-felt-700 px-2 text-lg font-semibold text-white active:bg-felt-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chestnut-400";

function describe(action: LiveAction, nameOf: (id: ID) => string): string {
  if (action.type === "buyIn") return `${formatDollars(action.amount)} for ${nameOf(action.player)}`;
  if (action.type === "addPlayer") return `adding ${nameOf(action.player)}`;
  return `removing ${nameOf(action.player)}`;
}

function PlayerCard({
  game,
  player,
  name,
  guestNote,
  presets,
  onBuyIn,
  onRemove,
}: {
  game: LocalGame;
  player: ID;
  name: string;
  guestNote: string | null;
  presets: number[];
  onBuyIn: (amount: number) => void;
  onRemove: () => void;
}) {
  const [custom, setCustom] = useState<string | null>(null);
  const state = liveState(game);
  const total = playerTotal(state, player);
  const count = state.buyIns.filter((b) => b.player === player).length;
  const customAmount = parseStack(custom ?? "");

  function submitCustom(e: FormEvent) {
    e.preventDefault();
    if (customAmount === null || customAmount < 1) return;
    onBuyIn(customAmount);
    setCustom(null);
  }

  return (
    <li className="rounded-lg border border-felt-700 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">
          {name}
          {guestNote && <span className={`ml-2 text-xs font-normal ${muted}`}>{guestNote}</span>}
        </span>
        <span className="text-right">
          <span className="text-lg font-semibold tabular-nums">{formatDollars(total)}</span>
          <span className={`block text-xs ${muted}`}>
            {count === 0 ? "no buy-in yet" : `${count} buy-in${count === 1 ? "" : "s"}`}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((amount) => (
          <button key={amount} type="button" className={bigBtn} onClick={() => onBuyIn(amount)} aria-label={`Buy in ${formatDollars(amount)} for ${name}`}>
            +{formatDollars(amount)}
          </button>
        ))}
        {custom === null && (
          <button type="button" className={`${btnSecondary} min-h-[56px]`} onClick={() => setCustom("")}>
            Custom
          </button>
        )}
      </div>
      {custom !== null && (
        <form onSubmit={submitCustom} className="mt-2 flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Custom buy-in for {name}</span>
            <input
              className={input}
              inputMode="numeric"
              placeholder="Amount"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              autoFocus
            />
          </label>
          <button type="submit" className={btnPrimary} disabled={customAmount === null || customAmount < 1}>
            Add
          </button>
          <button type="button" className={btnSecondary} onClick={() => setCustom(null)}>
            Cancel
          </button>
        </form>
      )}
      {total === 0 && (
        <button type="button" className={`mt-2 min-h-[48px] text-sm underline ${muted}`} onClick={onRemove}>
          Remove {name} (picked by mistake)
        </button>
      )}
    </li>
  );
}

function LatePlayerPicker({
  data,
  game,
  onAdd,
  onClose,
}: {
  data: Data;
  game: LocalGame;
  onAdd: (player: ID, choice: GuestChoice | null) => void;
  onClose: () => void;
}) {
  const loggedIn = useLoggedIn();
  const [search, setSearch] = useState("");
  const [guestFor, setGuestFor] = useState<ID | null>(null);
  const inGame = new Set(liveState(game).players);
  const q = search.trim().toLowerCase();
  const candidates = data.players
    .filter((p) => p.status === "active" && !inGame.has(p.id) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const season = data.seasons.find((s) => s.id === game.seasonId);

  if (guestFor) {
    const name = data.players.find((p) => p.id === guestFor)?.name ?? "This guest";
    return (
      <section role="dialog" aria-label="Late guest" className="rounded-lg border border-chestnut-400 p-4">
        <p className="mb-1 font-semibold">{name} is a guest</p>
        <p className={`mb-3 text-sm ${muted}`}>
          Add {name} to {season?.name ?? "the season"} as a regular (when the game is saved), or make this whole game incognito.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" className={btnPrimary} onClick={() => onAdd(guestFor, "promote")}>
            Add {name} to {season?.name ?? "the season"}
          </button>
          <button type="button" className={btnSecondary} onClick={() => onAdd(guestFor, "incognito")}>
            Make this game incognito
          </button>
          <button type="button" className={btnSecondary} onClick={() => setGuestFor(null)}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Add a late player" className="rounded-lg border border-felt-700 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Add a late player</h2>
        <button type="button" className={btnSecondary} onClick={onClose}>
          Close
        </button>
      </div>
      <label className="mb-2 block">
        <span className="sr-only">Search players</span>
        <input className={input} type="search" placeholder="Search players" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {candidates.length === 0 ? (
        <p className={`py-2 text-sm ${muted}`}>Everyone active is already in the game.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`${btnSecondary} flex w-full items-center justify-between`}
                onClick={() => (lateNeedsGuestChoice(data, game, p.id) ? setGuestFor(p.id) : onAdd(p.id, null))}
              >
                <span>{p.name}</span>
                {p.type === "guest" && <span className="text-xs opacity-70">Guest</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-2 text-sm ${muted}`}>
        {loggedIn ? (
          <>
            Someone new? <Link to="/admin/players" className="underline">Add them on the Players screen</Link>. The game stays
            saved on this phone.
          </>
        ) : (
          "Someone new? Log in (needs internet) to add them on the Players screen."
        )}
      </p>
    </section>
  );
}

export function LiveGame() {
  const { data } = useData();
  const game = useLocalGame();
  const loggedIn = useLoggedIn();
  const navigate = useNavigate();
  const { update, error } = useGameUpdater();
  const [addingLate, setAddingLate] = useState(false);

  if (!game) {
    return (
      <div className="p-4">
        <p className="mb-3">No game in progress on this phone.</p>
        <Link to="/admin/start" className={`${btnPrimary} inline-flex items-center`}>
          Start game
        </Link>
      </div>
    );
  }

  const state = liveState(game);
  const players = data?.players ?? [];
  const nameOf = (id: ID) => players.find((p) => p.id === id)?.name ?? "Unknown player";
  const presets = data?.settings.presetBuyIns ?? FALLBACK_PRESETS;
  const season = data?.seasons.find((s) => s.id === game.seasonId);
  const lastAction = game.actions[game.actions.length - 1];
  const now = () => new Date().toISOString();

  function discard() {
    const id = game!.id;
    clearLocalGame();
    // Best effort (§9 decision 4): if this fails, the next Start shows "Clear stuck game".
    if (isLoggedIn()) void saveChange(clearMarkerChange(id), discardedLiveGameMessage()).catch(() => {});
    navigate("/admin");
  }

  return (
    <div className="p-4 pb-36">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Live game</h1>
          <p className={`text-sm ${muted}`}>
            {formatDate(`${game.date}T12:00:00`)} · {state.mode === "season" ? (season?.name ?? "Season") : "Incognito"}
          </p>
        </div>
        <div className="text-right">
          <span className={`block text-xs ${muted}`}>Table total</span>
          <span className="text-2xl font-bold tabular-nums">{formatDollars(tableTotal(state))}</span>
        </div>
      </div>

      {!loggedIn && (
        <p role="status" className={`mb-3 rounded-lg border border-felt-700 px-3 py-2 text-sm ${muted}`}>
          Not logged in. Everything is saved on this phone; you'll log in to sync after the game.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-loss">
          {error}
        </p>
      )}

      <ul className="mb-4 flex flex-col gap-3">
        {state.players.map((p) => (
          <PlayerCard
            key={p}
            game={game}
            player={p}
            name={nameOf(p)}
            guestNote={state.promote.includes(p) ? "joins season at save" : players.find((x) => x.id === p)?.type === "guest" ? "guest" : null}
            presets={presets}
            onBuyIn={(amount) => update((g) => addBuyIn(g, p, amount, now()))}
            onRemove={() => update((g) => removePlayer(g, p, now()))}
          />
        ))}
      </ul>

      {data && addingLate ? (
        <LatePlayerPicker
          data={data}
          game={game}
          onClose={() => setAddingLate(false)}
          onAdd={(p, choice) => {
            if (update((g) => addLatePlayer(data, g, p, now(), choice))) setAddingLate(false);
          }}
        />
      ) : (
        <button type="button" className={`${btnSecondary} mb-6 w-full`} onClick={() => setAddingLate(true)} disabled={!data}>
          + Add a late player
        </button>
      )}

      <div className="mt-6">
        <ConfirmButton
          label="Discard this game"
          className={btnDanger}
          prompts={["Discard this game? Every buy-in will be lost.", "Really discard? This can't be undone."]}
          confirmLabel="Discard game"
          onConfirm={discard}
        />
      </div>

      <div className="ct-above-nav flex gap-2 border-t border-felt-700 bg-white p-2 dark:bg-felt-900">
        <button
          type="button"
          className={`${btnSecondary} min-w-0 flex-1 truncate`}
          disabled={!lastAction}
          onClick={() => update(undo)}
        >
          {lastAction ? `Undo ${describe(lastAction, nameOf)}` : "Nothing to undo"}
        </button>
        <Link to="/admin/end" className={`${btnPrimary} flex flex-1 items-center justify-center`}>
          End game
        </Link>
      </div>
    </div>
  );
}
