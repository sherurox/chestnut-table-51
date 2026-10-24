import { Fragment, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { replayBox } from "../domain/chipBox.js";
import { chipStepError } from "../domain/chips.js";
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
import { useChipMode } from "../lib/chipMode.js";
import { boxCantMakeText, boxLine, suggestionText } from "../lib/chipText.js";
import { formatDate, formatDollars } from "../lib/format.js";
import { useData } from "../state/DataContext.js";
import { isLoggedIn } from "../storage/auth.js";
import { saveChange } from "../storage/githubWrite.js";
import { clearLocalGame } from "../storage/localGame.js";
import { useGameUpdater, useLocalGame } from "./localHooks.js";
import { EmptyState } from "../design/components.js";
import { chipFeedback } from "../design/motion.js";
import { ConfirmButton, btnDanger, btnPrimary, btnSecondary, input, muted, useLoggedIn } from "./ui.js";

const FALLBACK_PRESETS = [1000, 1500, 2000];
// Poker-chip colours for the preset buttons, in order.
const CHIP_TONES = ["red", "blue", "black", "green"] as const;

// The Undo button always names the whole target, e.g. "Undo: Shreyas +$1,500". Never truncated.
function undoLabel(action: LiveAction, nameOf: (id: ID) => string): string {
  if (action.type === "buyIn") return `Undo: ${nameOf(action.player)} +${formatDollars(action.amount)}`;
  if (action.type === "addPlayer") return `Undo: add ${nameOf(action.player)}`;
  return `Undo: remove ${nameOf(action.player)}`;
}

// Chip mode: the chips to hand over for the buy-in just added, or why the box can't make it (§9, step E).
interface Suggestion {
  text: string | null;
  warning: string | null;
}

// "Box: 60 white · 10 red · …": wraps only between colours, never inside "10 red".
function ChipLine({ text }: { text: string }) {
  const colon = text.indexOf(": ");
  const head = colon >= 0 ? text.slice(0, colon + 2) : "";
  return (
    <>
      {head}
      {text
        .slice(head.length)
        .split(" · ")
        .map((part, i) => (
          <Fragment key={i}>
            {i > 0 && " · "}
            <span className="whitespace-nowrap">{part}</span>
          </Fragment>
        ))}
    </>
  );
}

function SuggestionCard({ suggestion, onDismiss }: { suggestion: Suggestion; onDismiss: () => void }) {
  return (
    <div role="status" className="ct-panel ct-panel-brass mt-3 flex items-start gap-2 p-3">
      <div className="min-w-0 flex-1">
        {suggestion.text && (
          <p className="ct-num font-semibold break-words">
            <ChipLine text={suggestion.text} />
          </p>
        )}
        {suggestion.warning && <p className="text-sm font-medium text-loss">⚠ {suggestion.warning}</p>}
      </div>
      <button type="button" className={`${btnSecondary} w-12 shrink-0 px-0`} onClick={onDismiss} aria-label="Dismiss chip suggestion">
        ✕
      </button>
    </div>
  );
}

function PlayerCard({
  game,
  player,
  name,
  guestNote,
  presets,
  suggestion,
  onBuyIn,
  onRemove,
  onDismissSuggestion,
}: {
  game: LocalGame;
  player: ID;
  name: string;
  guestNote: string | null;
  presets: number[];
  suggestion: Suggestion | null;
  onBuyIn: (amount: number) => void;
  onRemove: () => void;
  onDismissSuggestion: () => void;
}) {
  const [custom, setCustom] = useState<string | null>(null);
  const state = liveState(game);
  const total = playerTotal(state, player);
  const count = state.buyIns.filter((b) => b.player === player).length;
  const customAmount = parseStack(custom ?? "");
  // The chip set has no $1 chips: custom buy-ins are multiples of $5, in chip mode or not.
  const customError = customAmount !== null && customAmount >= 1 ? chipStepError(customAmount) : null;

  function submitCustom(e: FormEvent) {
    e.preventDefault();
    if (customAmount === null || customAmount < 1 || customError) return;
    onBuyIn(customAmount);
    setCustom(null);
  }

  return (
    <li className="ct-panel p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-lg font-semibold break-words">{name}</span>
          {guestNote && <span className="ct-tag mt-1">{guestNote}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="ct-num block text-xl font-bold">{formatDollars(total)}</span>
          <span className={`block text-xs ${muted}`}>
            {count === 0 ? "no buy-in yet" : `${count} buy-in${count === 1 ? "" : "s"}`}
          </span>
        </span>
      </div>
      {/* Chips record the buy-in first, then pop (and buzz on Android): feedback never delays input. */}
      <div className="grid grid-cols-4 justify-items-center gap-2">
        {presets.map((amount, i) => (
          <button
            key={amount}
            type="button"
            className="ct-chip"
            data-tone={CHIP_TONES[i % CHIP_TONES.length]}
            onClick={(e) => {
              onBuyIn(amount);
              chipFeedback(e.currentTarget);
            }}
            aria-label={`Buy in ${formatDollars(amount)} for ${name}`}
          >
            {formatDollars(amount)}
          </button>
        ))}
        {custom === null && (
          <button type="button" className="ct-chip" data-tone="outline" onClick={() => setCustom("")} aria-label={`Custom buy-in for ${name}`}>
            Custom
          </button>
        )}
      </div>
      {custom !== null && (
        <form onSubmit={submitCustom} className="mt-3 flex flex-wrap gap-2">
          <label className="min-w-[8rem] flex-1">
            <span className="sr-only">Custom buy-in for {name}</span>
            <input
              className={input}
              inputMode="numeric"
              placeholder="Amount"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-invalid={customError ? true : undefined}
              autoFocus
            />
          </label>
          <button type="submit" className={btnPrimary} disabled={customAmount === null || customAmount < 1 || customError !== null}>
            Add
          </button>
          <button type="button" className={btnSecondary} onClick={() => setCustom(null)}>
            Cancel
          </button>
          {customError && (
            <p role="alert" className="w-full text-sm text-loss">
              {customError}
            </p>
          )}
        </form>
      )}
      {suggestion && <SuggestionCard suggestion={suggestion} onDismiss={onDismissSuggestion} />}
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
      <section role="dialog" aria-label="Late guest" className="ct-panel ct-panel-brass p-4">
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
    <section aria-label="Add a late player" className="ct-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="ct-heading text-lg">
          <span className="ct-suit" aria-hidden="true">
            ♣
          </span>
          Add a late player
        </h2>
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
                {p.type === "guest" && <span className="ct-tag">Guest</span>}
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
  const chipMode = useChipMode();
  // The buy-in whose chip suggestion is showing ("player|at"): only while it is still the last action.
  const [suggestFor, setSuggestFor] = useState<string | null>(null);

  if (!game) {
    return (
      <div className="p-4">
        <EmptyState suit="♠" title="No game in progress on this phone">
          <Link to="/admin/start" className={`${btnPrimary} mt-3`}>
            Start game
          </Link>
        </EmptyState>
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
  // Box tracking is derived from the buy-ins every render (cached per split), never stored.
  const replay = chipMode ? replayBox(state.buyIns) : null;
  const lastStep = replay && lastAction?.type === "buyIn" ? replay.steps[replay.steps.length - 1] : undefined;
  const suggestion =
    lastStep && suggestFor === `${lastStep.buyIn.player}|${lastStep.buyIn.at}`
      ? {
          player: lastStep.buyIn.player,
          text: lastStep.split ? suggestionText(nameOf(lastStep.buyIn.player), lastStep.split) : null,
          warning: lastStep.failure ? boxCantMakeText(lastStep.buyIn.amount, lastStep.failure) : null,
        }
      : null;

  function buyIn(player: ID, amount: number) {
    const at = now();
    if (update((g) => addBuyIn(g, player, amount, at))) setSuggestFor(`${player}|${at}`);
  }

  function discard() {
    const id = game!.id;
    clearLocalGame();
    // Best effort (§9 decision 4): if this fails, the next Start shows "Clear stuck game".
    if (isLoggedIn()) void saveChange(clearMarkerChange(id), discardedLiveGameMessage()).catch(() => {});
    navigate("/admin");
  }

  return (
    <div className="px-4 pt-2 pb-40">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="ct-heading text-2xl">
            <span className="ct-suit" aria-hidden="true">
              ♠
            </span>
            Live game
          </h1>
          <p className={`text-sm ${muted}`}>
            {formatDate(`${game.date}T12:00:00`)} · {state.mode === "season" ? (season?.name ?? "Season") : "Incognito"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`block text-xs font-semibold tracking-wide uppercase ${muted}`}>Table total</span>
          <span className="ct-num text-3xl font-bold text-brass">{formatDollars(tableTotal(state))}</span>
        </div>
      </div>
      {replay && (
        <p className={`ct-num mb-3 text-sm ${muted}`}>
          <ChipLine text={boxLine(replay.left)} />
        </p>
      )}

      {!loggedIn && (
        <p role="status" className={`ct-panel mb-3 px-3 py-2 text-sm ${muted}`}>
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
            suggestion={suggestion?.player === p ? suggestion : null}
            onBuyIn={(amount) => buyIn(p, amount)}
            onRemove={() => update((g) => removePlayer(g, p, now()))}
            onDismissSuggestion={() => setSuggestFor(null)}
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

      {/* Thumb-reach action bar. "End game" takes only the width it needs; Undo gets the rest and
          wraps to a second line rather than truncating. */}
      <div className="ct-above-nav ct-action-bar flex items-stretch gap-2">
        <button type="button" className={`${btnSecondary} flex-1 text-[15px]`} disabled={!lastAction} onClick={() => update(undo)}>
          {lastAction ? undoLabel(lastAction, nameOf) : "Nothing to undo"}
        </button>
        <Link to="/admin/end" className={`${btnPrimary} shrink-0 px-4 whitespace-nowrap`}>
          End game
        </Link>
      </div>
    </div>
  );
}
