import { PageTitle } from "../design/components.js";
import { Link, useNavigate } from "react-router-dom";
import { endCheck, finishLocalGame, liveState, parseStack, playerTotal, setFinalStack } from "../domain/liveGame.js";
import type { ID } from "../domain/types.js";
import { formatDollars, formatSignedDollars } from "../lib/format.js";
import { useData } from "../state/DataContext.js";
import { moveToQueue } from "../storage/localGame.js";
import { useGameUpdater, useLocalGame } from "./localHooks.js";
import { ChipCheckPanel } from "./ChipCheckPanel.js";
import { useSync } from "./sync.js";
import { ConfirmButton, btnPrimary, btnSecondary, input, muted } from "./ui.js";

// Final stacks + the strict chip check (CLAUDE.md §5.6, §9.5). Works without login: Save moves the game
// into the "Not synced" queue on this phone, and it is committed once online and logged in.
export function EndGame() {
  const { data } = useData();
  const game = useLocalGame();
  const navigate = useNavigate();
  const { syncNow } = useSync();
  const { update, error, setError } = useGameUpdater();

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

  function save() {
    try {
      moveToQueue(finishLocalGame(game!, nameOf));
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

      {error && (
        <p role="alert" className="mb-3 text-sm text-loss">
          {error}
        </p>
      )}

      {check.ok ? (
        <ConfirmButton
          label="Save game"
          className={`${btnPrimary} w-full`}
          prompts={["End the game and save it? Buy-ins and stacks can only be changed later by editing the game."]}
          confirmLabel="Yes, save game"
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
