import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, Loading, PageTitle } from "../design/components.js";
import { seasonActionBlock } from "../domain/adminOps.js";
import { deletedGameMessage, editedGameMessage } from "../domain/commitMessages.js";
import { localIsoDate } from "../domain/dates.js";
import {
  deleteGameChange,
  draftFromGame,
  editCheck,
  editGameChange,
  parseBuyIn,
  seasonDateRange,
  seasonFullError,
  type GameDraft,
} from "../domain/gameEdits.js";
import { guestsNeedingChoice, parseStack } from "../domain/liveGame.js";
import type { Change } from "../domain/adminOps.js";
import type { Data, Game, ID, Season } from "../domain/types.js";
import { formatSignedDollars } from "../lib/format.js";
import { championChangeLine, closedSeasonWarning, editDiffLines, gameSummary } from "../lib/gameEditText.js";
import { gameById, seasonById } from "../lib/selectors.js";
import { useData } from "../state/DataContext.js";
import { ChipCheckPanel } from "./ChipCheckPanel.js";
import { useLocalGame, useQueue } from "./localHooks.js";
import { ConfirmButton, SaveStatus, btnDanger, btnPrimary, btnSecondary, input, muted, useSave } from "./ui.js";

// What a change would do to the data, for the closed-season confirm. null if it can't apply.
function applied(data: Data, change: Change): Data | null {
  try {
    return change(data);
  } catch {
    return null;
  }
}

// #/admin/games/:id/edit: edit or delete any finished game in any season (CLAUDE.md §5.9).
export function EditGame() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <Loading />;
  const game = data && id ? gameById(data, id) : undefined;
  if (!data || !game || game.status !== "finished") {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title={game?.status === "deleted" ? "This game is deleted" : "Game not found"}>
          <Link to={game ? "/admin/deleted" : "/games"} className="ct-focus inline-flex min-h-[48px] items-center underline">
            {game ? "Go to Deleted games to restore it" : "Back to game history"}
          </Link>
        </EmptyState>
      </div>
    );
  }
  const season = seasonById(data, game.seasonId);
  if (!season) return <EmptyState suit="♦" title="This game's season is missing" />;
  return <EditForm key={game.id} data={data} game={game} season={season} />;
}

function EditForm({ data, game, season }: { data: Data; game: Game; season: Season }) {
  const navigate = useNavigate();
  const local = useLocalGame();
  const queue = useQueue();
  const { save, saving, state } = useSave();
  // The game as the admin opened it: the save refuses if it has changed on GitHub since (stale guard).
  const [before] = useState(game);
  const [draft, setDraft] = useState<GameDraft>(() => draftFromGame(game));
  const [closedOk, setClosedOk] = useState(season.status === "active");
  const [adding, setAdding] = useState("");
  const playersRef = useRef<HTMLHeadingElement>(null);

  const block = seasonActionBlock({ data, hasLocalGame: local !== null, queued: queue.length });
  const nameOf = (pid: ID) => data.players.find((p) => p.id === pid)?.name ?? pid;
  const today = localIsoDate();
  const check = editCheck(data, before, draft, nameOf, today, new Date().toISOString());
  const range = seasonDateRange(data, before.seasonId, today);
  const closed = season.status === "closed";

  if (closed && !closedOk) {
    return (
      <div className="px-4 pt-2 pb-4">
        <PageTitle suit="♦" title="Edit game" subtitle={gameSummary(data, before)} />
        <section role="alert" className="ct-panel ct-panel-brass flex flex-col gap-3 p-4">
          <p className="font-medium">{closedSeasonWarning(data, season)}</p>
          <button type="button" className={btnPrimary} onClick={() => setClosedOk(true)}>
            Edit anyway
          </button>
          <Link to={`/games/${before.id}`} className={btnSecondary}>
            Cancel
          </Link>
        </section>
      </div>
    );
  }

  const set = (patch: Partial<GameDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setBuyIns = (pid: ID, rows: GameDraft["buyIns"][ID]) => setDraft((d) => ({ ...d, buyIns: { ...d.buyIns, [pid]: rows } }));
  const guests = guestsNeedingChoice(data, draft.players, draft.mode);
  // A full season takes no more season games (§5.2): an incognito game stays incognito.
  const seasonBlocked = seasonFullError(data, before, { mode: "season" });
  const totalIn = check.game.buyIns.reduce((sum, b) => sum + b.amount, 0);
  const addable = data.players
    .filter((p) => !draft.players.includes(p.id) && (p.status === "active" || before.players.includes(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name));

  function removePlayer(pid: ID) {
    setDraft((d) => {
      const { [pid]: _buyIns, ...buyIns } = d.buyIns;
      const { [pid]: _stack, ...stacks } = d.stacks;
      return { ...d, players: d.players.filter((x) => x !== pid), buyIns, stacks };
    });
  }

  function addPlayer() {
    if (!adding) return;
    setDraft((d) => ({
      ...d,
      players: [...d.players, adding],
      buyIns: { ...d.buyIns, [adding]: [{ amount: "", index: null }] },
      stacks: { ...d.stacks, [adding]: "" },
    }));
    setAdding("");
  }

  function fixBuyIns() {
    playersRef.current?.scrollIntoView({ block: "start" });
    playersRef.current?.focus();
  }

  async function onSave() {
    const fresh = editCheck(data, before, draft, nameOf, localIsoDate(), new Date().toISOString());
    if (!fresh.ok || fresh.unchanged) return;
    const ok = await save(
      editGameChange({ before, after: fresh.game, promote: fresh.promote }),
      editedGameMessage({ date: fresh.game.date, seasonName: season.name, promotedNames: fresh.promote.map(nameOf) }),
      "Game saved.",
    );
    if (ok) navigate(`/games/${before.id}`, { replace: true });
  }

  async function onDelete() {
    const ok = await save(deleteGameChange(before.id, new Date().toISOString()), deletedGameMessage(before.date, season.name), "Game deleted.");
    if (ok) navigate("/admin/deleted", { replace: true });
  }

  const canSave = check.ok && !check.unchanged && !block;
  const diff = editDiffLines(data, before, draft, check.game, check.promote);
  const afterEdit = closed && canSave ? applied(data, editGameChange({ before, after: check.game, promote: check.promote })) : null;
  const afterDelete = closed ? applied(data, deleteGameChange(before.id, new Date().toISOString())) : null;

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Edit game" subtitle={`${season.name}${closed ? " (closed)" : ""}`} />

      {block && (
        <div role="alert" className="ct-panel ct-panel-brass mb-4 flex flex-col gap-2 p-4">
          <p className="font-medium">Editing is blocked: {block}</p>
          <Link to={local ? "/admin/live" : "/admin"} className={`${btnSecondary} w-full`}>
            {local ? "Back to the game" : "Go to Admin home"}
          </Link>
        </div>
      )}

      <label className="mb-4 flex flex-col">
        <span className="ct-label">Date</span>
        <input
          type="date"
          className={input}
          value={draft.date}
          min={range?.min}
          max={range?.max}
          onChange={(e) => set({ date: e.target.value })}
          required
        />
      </label>

      <fieldset className="mb-4 flex gap-2">
        <legend className="ct-label">Mode</legend>
        {(["season", "incognito"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={draft.mode === m}
            disabled={m === "season" && seasonBlocked !== null}
            onClick={() => set({ mode: m, guestChoice: null })}
            className={`${btnSecondary} ct-choice flex-1`}
          >
            {m === "season" ? season.name : "Incognito"}
          </button>
        ))}
      </fieldset>
      {seasonBlocked && <p className={`-mt-2 mb-4 text-sm ${muted}`}>{seasonBlocked}</p>}

      {guests.length > 0 && (
        <section aria-label="Guests in this game" className="ct-panel ct-panel-brass mb-4 p-4">
          <p className="mb-1 font-semibold">This game has guests: {guests.map(nameOf).join(", ")}</p>
          <p className={`mb-3 text-sm ${muted}`}>Add them to {season.name} as regulars, or keep this game incognito.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-pressed={draft.guestChoice === "promote"}
              className={`${btnSecondary} ct-choice`}
              onClick={() => set({ guestChoice: "promote" })}
            >
              {draft.guestChoice === "promote" ? "✓ " : ""}Add {guests.length === 1 ? "guest" : "guests"} to {season.name}
            </button>
            <button type="button" className={btnSecondary} onClick={() => set({ mode: "incognito", guestChoice: null })}>
              Keep this game incognito
            </button>
          </div>
        </section>
      )}

      <h2 ref={playersRef} tabIndex={-1} className="ct-heading ct-focus mb-2 text-lg">
        <span className="ct-suit" aria-hidden="true">
          ♣
        </span>
        Players, buy-ins and final stacks
      </h2>
      <ul className="mb-4 flex flex-col gap-3">
        {draft.players.map((pid) => {
          const name = nameOf(pid);
          const rows = draft.buyIns[pid] ?? [];
          const stack = parseStack(draft.stacks[pid]);
          const bought = rows.reduce((sum, r) => sum + (parseBuyIn(r.amount) ?? 0), 0);
          const result = stack === null ? null : stack - bought;
          return (
            <li key={pid} className="ct-panel flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-semibold break-words">{name}</span>
                <button type="button" className={btnSecondary} onClick={() => removePlayer(pid)} aria-label={`Remove ${name} from this game`}>
                  Remove
                </button>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={`text-sm ${muted}`}>Buy-in {i + 1}</span>
                    <input
                      className={input}
                      inputMode="numeric"
                      placeholder="Amount"
                      value={r.amount}
                      aria-invalid={parseBuyIn(r.amount) === null}
                      onChange={(e) => setBuyIns(pid, rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    />
                  </label>
                  <button
                    type="button"
                    className={`${btnSecondary} w-12 shrink-0 px-0`}
                    aria-label={`Remove ${name}'s buy-in ${i + 1}`}
                    onClick={() => setBuyIns(pid, rows.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className={btnSecondary} onClick={() => setBuyIns(pid, [...rows, { amount: "", index: null }])}>
                + Add buy-in
              </button>
              <label className="flex flex-col gap-1">
                <span className={`text-sm ${muted}`}>Final stack</span>
                <input
                  className={input}
                  inputMode="numeric"
                  placeholder="Final stack"
                  value={draft.stacks[pid] ?? ""}
                  aria-invalid={stack === null}
                  onChange={(e) => setDraft((d) => ({ ...d, stacks: { ...d.stacks, [pid]: e.target.value } }))}
                />
              </label>
              {result !== null && (
                <p className={`text-sm ${result > 0 ? "text-win" : result < 0 ? "text-loss" : ""}`}>Result {formatSignedDollars(result)}</p>
              )}
            </li>
          );
        })}
      </ul>

      {addable.length > 0 && (
        <div className="mb-4 flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col">
            <span className="ct-label">Add a player</span>
            <select className={input} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Pick a player</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.type === "guest" ? " (guest)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${btnSecondary} shrink-0`} disabled={!adding} onClick={addPlayer}>
            Add
          </button>
        </div>
      )}

      <ChipCheckPanel
        totalIn={totalIn}
        check={check}
        fix={
          <button type="button" className={`${btnSecondary} mt-1 w-full`} onClick={fixBuyIns}>
            Fix buy-ins
          </button>
        }
      />

      {canSave ? (
        <ConfirmButton
          key={JSON.stringify(draft)}
          label="Save changes"
          className={`${btnPrimary} w-full`}
          disabled={saving}
          prompts={[afterEdit ? `Save these changes? ${championChangeLine(data, afterEdit, season, "edit")}` : "Save these changes?"]}
          details={
            <ul className="list-disc pl-5 text-sm">
              {diff.map((line) => (
                <li key={line} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          }
          confirmLabel="Yes, save changes"
          onConfirm={() => void onSave()}
        />
      ) : (
        <button type="button" className={`${btnPrimary} w-full`} disabled>
          {block ? "Save changes (blocked)" : check.unchanged ? "No changes yet" : "Save changes (chip check must pass)"}
        </button>
      )}
      <SaveStatus state={state} />

      <section className="ct-panel mt-2 flex flex-col gap-2 p-4">
        <h2 className="ct-heading text-lg">Delete this game</h2>
        <p className={`text-sm ${muted}`}>It leaves the standings and history and goes to Deleted games, where you can restore it.</p>
        <ConfirmButton
          label="Delete game"
          className={btnDanger}
          disabled={saving || block !== null}
          prompts={[
            `Delete ${gameSummary(data, before)}?${afterDelete ? ` ${championChangeLine(data, afterDelete, season, "delete")}` : ""}`,
          ]}
          confirmLabel="Yes, delete game"
          onConfirm={() => void onDelete()}
        />
      </section>
    </div>
  );
}
