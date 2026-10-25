import { PageTitle } from "../design/components.js";
import { Link, useNavigate } from "react-router-dom";
import { ChipSwatch, Stepper, colorName } from "../components/ChipStepper.js";
import { CHIP_SET } from "../config.js";
import { colorDifferences, countedPerColor, replayBox, untrackedBuyIns } from "../domain/chipBox.js";
import {
  endCheck,
  finishGameChange,
  finishLocalGame,
  liveState,
  parseStack,
  playerTotal,
  setChipCounts,
  setFinalStack,
  setStackMode,
  stackModeOf,
  type LocalGame,
} from "../domain/liveGame.js";
import type { Data, ID } from "../domain/types.js";
import { useChipMode } from "../lib/chipMode.js";
import { COLOR_HINT_MATCH, COLOR_HINT_NEEDS_COUNTS, COLOR_HINT_NOTE, colorHint } from "../lib/chipText.js";
import { formatDollars, formatSignedDollars } from "../lib/format.js";
import { seasonCompleteLine } from "../lib/seasonText.js";
import { playSound } from "../lib/sound.js";
import { useData } from "../state/DataContext.js";
import { moveToQueue } from "../storage/localGame.js";
import { useGameUpdater, useLocalGame } from "./localHooks.js";
import { ChipCheckPanel } from "./ChipCheckPanel.js";
import { useSync } from "./sync.js";
import { ConfirmButton, btnPrimary, btnSecondary, input, muted } from "./ui.js";

// When saving this game fills the season (by the data on this phone), the confirm says so and names the
// champion with tonight's results in. Offline the data may be older; the sync decides for real (§5.2).
function seasonCompletePrompt(data: Data | null, finish: () => ReturnType<typeof finishLocalGame>): string | null {
  if (!data) return null;
  try {
    const entry = finish();
    return seasonCompleteLine(data, finishGameChange(entry)(data), entry.game.seasonId);
  } catch {
    return null;
  }
}

// Count chips (chip mode): one stepper per colour; the final stack is their value (setChipCounts).
function CountChips({ game, player, name, onCounts }: { game: LocalGame; player: ID; name: string; onCounts: (counts: (number | null)[]) => void }) {
  const counts = CHIP_SET.map((_, i) => game.chipCounts?.[player]?.[i] ?? null);
  const setCount = (i: number, n: number | null) => onCounts(counts.map((c, j) => (j === i ? n : c)));
  return (
    <ul aria-label={`${name}'s chips`}>
      {CHIP_SET.map((chip, i) => (
        <li key={chip.color} className="flex min-h-[56px] items-center gap-2 border-b border-line py-2 last:border-b-0">
          <ChipSwatch index={i} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{colorName(chip.color)}</p>
            <p className={`ct-num text-sm ${muted}`}>{formatDollars((counts[i] ?? 0) * chip.value)}</p>
          </div>
          <Stepper
            label={`${name}: ${colorName(chip.color)} ${formatDollars(chip.value)} chips`}
            value={counts[i] ?? 0}
            min={0}
            max={9999}
            onChange={(next) => setCount(i, next)}
            input={{ text: counts[i] === null ? "" : String(counts[i]), onText: (text) => setCount(i, text === "" ? null : Number(text)) }}
          />
        </li>
      ))}
    </ul>
  );
}

// Chip mode: chips counted per colour against chips handed out (the box replay). A hint only: the strict
// chip check on dollars is the only thing that blocks Save.
function ColorHintPanel({ game, nameOf }: { game: LocalGame; nameOf: (id: ID) => string }) {
  const state = liveState(game);
  const allCounted = state.players.every((p) => stackModeOf(game, p) === "chips" && (game.chipCounts?.[p] ?? []).some((n) => n !== null));
  const replay = replayBox(state.buyIns);
  const hint = allCounted
    ? colorHint(
        colorDifferences(countedPerColor(state.players.map((p) => (game.chipCounts?.[p] ?? []).map((n) => n ?? 0))), replay.handedOut),
        untrackedBuyIns(replay),
        nameOf,
      )
    : null;
  return (
    <section aria-live="polite" className="ct-panel mb-4 p-4">
      <h2 className="ct-heading mb-2 text-lg">
        <span className="ct-suit" aria-hidden="true">
          ♣
        </span>
        Chips by colour
      </h2>
      {!hint ? (
        <p className={`text-sm ${muted}`}>{COLOR_HINT_NEEDS_COUNTS}</p>
      ) : hint.matches ? (
        <p className="text-sm">{COLOR_HINT_MATCH}</p>
      ) : (
        <>
          <ul className="mb-2 list-disc pl-5 text-sm">
            {hint.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={`text-sm ${muted}`}>{COLOR_HINT_NOTE}</p>
        </>
      )}
    </section>
  );
}

// Final stacks + the strict chip check (CLAUDE.md §5.6, §9.5). Works without login: Save moves the game
// into the "Not synced" queue on this phone, and it is committed once online and logged in.
export function EndGame() {
  const { data } = useData();
  const game = useLocalGame();
  const navigate = useNavigate();
  const { syncNow } = useSync();
  const { update, error, setError } = useGameUpdater();
  const chipMode = useChipMode();

  if (!game) {
    return (
      <div className="p-4">
        <p className="mb-3">No game in progress on this phone.</p>
        <Link to="/admin" className={`${btnSecondary} inline-flex items-center`}>
          Back to admin
        </Link>
      </div>
    );
  }

  const nameOf = (id: ID) => data?.players.find((p) => p.id === id)?.name ?? "Unknown player";
  const state = liveState(game);
  const check = endCheck(game, nameOf);
  const totalIn = state.buyIns.reduce((sum, b) => sum + b.amount, 0);
  const completes = check.ok ? seasonCompletePrompt(data, () => finishLocalGame(game, nameOf)) : null;
  const seasonName = data?.seasons.find((s) => s.id === game.seasonId)?.name ?? "the season";

  function save() {
    try {
      moveToQueue(finishLocalGame(game!, nameOf));
      playSound("saved");
      navigate("/admin");
      void syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the game on this phone.");
    }
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="End game" subtitle="Count each player's chips and enter their final stack. $0 is fine." />

      <ul className="mb-4 flex flex-col gap-3">
        {state.players.map((p) => {
          const stack = parseStack(game.finalStacks[p]);
          const bought = playerTotal(state, p);
          const result = stack === null ? null : stack - bought;
          if (chipMode) {
            const counting = stackModeOf(game, p) === "chips";
            return (
              <li key={p} className="ct-panel p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-semibold break-words">{nameOf(p)}</span>
                  <span className={`shrink-0 text-sm ${muted}`}>bought in {formatDollars(bought)}</span>
                </div>
                {counting ? (
                  <>
                    <CountChips game={game} player={p} name={nameOf(p)} onCounts={(counts) => update((g) => setChipCounts(g, p, counts))} />
                    <p className="mt-2 flex items-baseline justify-between gap-2" aria-live="polite">
                      <span className={`text-sm ${muted}`}>Final stack</span>
                      <span className="ct-num text-xl font-bold">{stack === null ? "—" : formatDollars(stack)}</span>
                    </p>
                  </>
                ) : (
                  <label className="mt-1 flex flex-col gap-1">
                    <span className="sr-only">{nameOf(p)}'s final stack</span>
                    <input
                      className={`${input} text-lg`}
                      inputMode="numeric"
                      placeholder="Final stack"
                      value={game.finalStacks[p] ?? ""}
                      onChange={(e) => update((g) => setFinalStack(g, p, e.target.value))}
                    />
                  </label>
                )}
                {result !== null && (
                  <p className={`mt-1 text-sm ${result > 0 ? "text-win" : result < 0 ? "text-loss" : ""}`}>
                    Result {formatSignedDollars(result)}
                  </p>
                )}
                <button
                  type="button"
                  className={`mt-1 min-h-[48px] text-sm underline ${muted}`}
                  onClick={() => update((g) => setStackMode(g, p, counting ? "total" : "chips"))}
                >
                  {counting ? "Enter total instead" : "Count chips"}
                </button>
              </li>
            );
          }
          return (
            <li key={p} className="ct-panel p-3">
              <label className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between">
                  <span className="font-semibold">{nameOf(p)}</span>
                  <span className={`text-sm ${muted}`}>bought in {formatDollars(bought)}</span>
                </span>
                <input
                  className={`${input} text-lg`}
                  inputMode="numeric"
                  placeholder="Final stack"
                  value={game.finalStacks[p] ?? ""}
                  onChange={(e) => update((g) => setFinalStack(g, p, e.target.value))}
                />
              </label>
              {result !== null && (
                <p className={`mt-1 text-sm ${result > 0 ? "text-win" : result < 0 ? "text-loss" : ""}`}>
                  Result {formatSignedDollars(result)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <ChipCheckPanel
        totalIn={totalIn}
        check={check}
        fix={
          <Link to="/admin/live" className={`${btnSecondary} mt-1`}>
            Fix buy-ins
          </Link>
        }
      />

      {chipMode && <ColorHintPanel game={game} nameOf={nameOf} />}

      {error && (
        <p role="alert" className="mb-3 text-sm text-loss">
          {error}
        </p>
      )}

      {check.ok ? (
        <ConfirmButton
          label="Save game"
          className={`${btnPrimary} w-full`}
          prompts={[
            `${completes ?? "End the game and save it?"} Buy-ins and stacks can only be changed later by editing the game.`,
          ]}
          confirmLabel={completes ? `Yes, save and end ${seasonName}` : "Yes, save game"}
          onConfirm={save}
        />
      ) : (
        <button type="button" className={`${btnPrimary} w-full`} disabled>
          Save game (chip check must pass)
        </button>
      )}
    </div>
  );
}
