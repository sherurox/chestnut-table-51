import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Loading, PageTitle } from "../design/components.js";
import {
  endSeason,
  nextSeasonName,
  renameSeason,
  renameSeasonError,
  seasonActionBlock,
  seasonNameError,
  seasonStartError,
  startNewSeason,
} from "../domain/adminOps.js";
import { endedSeasonMessage, renamedSeasonMessage, startedSeasonMessage } from "../domain/commitMessages.js";
import { localIsoDate } from "../domain/dates.js";
import { newId } from "../domain/ids.js";
import type { Data, Season } from "../domain/types.js";
import { formatDate } from "../lib/format.js";
import { CANT_UNDO, crownLine } from "../lib/seasonText.js";
import { activeSeason, allSeasonsNewestFirst } from "../lib/selectors.js";
import { useData } from "../state/DataContext.js";
import { useLocalGame, useQueue } from "./localHooks.js";
import { ConfirmButton, SaveStatus, btnDanger, btnPrimary, btnSecondary, input, muted, useSave } from "./ui.js";

type Save = ReturnType<typeof useSave>["save"];

// An input's inline validation message, tied to it with aria-describedby.
function FieldError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <span id={id} role="alert" className="text-sm text-loss">
      {error}
    </span>
  );
}

function EndSeason({ data, season, save, saving, blocked }: { data: Data; season: Season; save: Save; saving: boolean; blocked: boolean }) {
  return (
    <section className="ct-panel mb-4 flex flex-col gap-2 p-4">
      <h2 className="ct-heading text-lg">End {season.name}</h2>
      <p className={`text-sm ${muted}`}>
        Closes it without starting a new one. No games can be played until a new season starts.
      </p>
      <ConfirmButton
        label={`End ${season.name}`}
        className={btnDanger}
        disabled={saving || blocked}
        prompts={[`${crownLine(data, season)} ${CANT_UNDO}`]}
        confirmLabel={`Yes, end ${season.name}`}
        onConfirm={() =>
          void save(endSeason({ today: localIsoDate() }), endedSeasonMessage(season.name), `${season.name} ended.`)
        }
      />
    </section>
  );
}

function StartSeason({ data, active, save, saving, blocked }: { data: Data; active: Season | undefined; save: Save; saving: boolean; blocked: boolean }) {
  const [name, setName] = useState(() => nextSeasonName(data));
  const [startedOn, setStartedOn] = useState(() => localIsoDate());
  const [errors, setErrors] = useState<{ name: string | null; startedOn: string | null }>({ name: null, startedOn: null });
  const trimmed = name.trim();

  // Runs before the confirm opens: it only opens for a valid name and date (the op checks again on save).
  function validate(): boolean {
    const next = { name: seasonNameError(data, name), startedOn: seasonStartError(data, startedOn, localIsoDate()) };
    setErrors(next);
    return !next.name && !next.startedOn;
  }
  const prompt = active
    ? `This closes ${active.name}. ${crownLine(data, active)} ${trimmed} starts with everyone at $0. ${CANT_UNDO}`
    : `Start ${trimmed} on ${formatDate(startedOn)}? Everyone starts at $0. ${CANT_UNDO}`;

  // A new id per attempt; the form resets after a save (it's keyed by the number of seasons).
  function start() {
    void save(
      startNewSeason({ id: newId(), name: trimmed, startedOn, today: localIsoDate() }),
      startedSeasonMessage(trimmed, active?.name),
      `${trimmed} started.`,
    );
  }

  return (
    <section className={`ct-panel mb-4 flex flex-col gap-2 p-4 ${active ? "" : "ct-panel-brass"}`}>
      <h2 className="ct-heading text-lg">Start new season</h2>
      <p className={`text-sm ${muted}`}>
        {active ? `Ends ${active.name} and starts the next one in one save.` : "No season is active. Start one to play games again."}
      </p>
      <label className="flex flex-col gap-1">
        <span>Name</span>
        <input
          className={input}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: null }));
          }}
          autoComplete="off"
          aria-invalid={errors.name !== null}
          aria-describedby={errors.name ? "season-name-error" : undefined}
        />
        <FieldError id="season-name-error" error={errors.name} />
      </label>
      <label className="flex flex-col gap-1">
        <span>Starts on</span>
        <input
          type="date"
          className={input}
          value={startedOn}
          max={localIsoDate()}
          onChange={(e) => {
            setStartedOn(e.target.value);
            setErrors((x) => ({ ...x, startedOn: null }));
          }}
          aria-invalid={errors.startedOn !== null}
          aria-describedby={errors.startedOn ? "season-start-error" : undefined}
        />
        <FieldError id="season-start-error" error={errors.startedOn} />
      </label>
      {/* Keyed by the inputs, so editing a field closes an open confirm (it named the old values). */}
      <ConfirmButton
        key={`${name}|${startedOn}`}
        label={`Start ${trimmed || "new season"}`}
        className={btnPrimary}
        disabled={saving || blocked}
        validate={validate}
        prompts={[prompt]}
        confirmLabel={`Yes, start ${trimmed}`}
        onConfirm={() => void start()}
      />
    </section>
  );
}

function SeasonRow({ data, season, save, saving }: { data: Data; season: Season; save: Save; saving: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(season.name);
  const [error, setError] = useState<string | null>(null);
  const errorId = `rename-error-${season.id}`;

  async function onRename(e: FormEvent) {
    e.preventDefault();
    const problem = renameSeasonError(data, season.id, newName);
    setError(problem);
    if (problem) return;
    const trimmed = newName.trim();
    const ok = await save(renameSeason(season.id, trimmed), renamedSeasonMessage(season.name, trimmed), `Renamed ${season.name} to ${trimmed}.`);
    if (ok) setRenaming(false);
  }

  if (renaming) {
    return (
      <li className="py-2">
        <form onSubmit={onRename} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span>Rename {season.name}</span>
            <input
              className={input}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
              autoFocus
              aria-invalid={error !== null}
              aria-describedby={error ? errorId : undefined}
            />
            <FieldError id={errorId} error={error} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={saving}>
              Save name
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={() => {
                setRenaming(false);
                setNewName(season.name);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="min-w-0">
        <span className="block font-medium break-words">{season.name}</span>
        <span className={`block text-sm ${muted}`}>
          {season.status === "active" ? "Active" : "Closed"} · {formatDate(season.startedOn)}
          {season.endedOn ? ` – ${formatDate(season.endedOn)}` : ""}
        </span>
      </span>
      <button type="button" className={btnSecondary} disabled={saving} onClick={() => setRenaming(true)}>
        Rename
      </button>
    </li>
  );
}

// #/admin/seasons: end the season, start a new one, rename any season (CLAUDE.md §5.2).
export function Seasons() {
  const { data, loading } = useData();
  const local = useLocalGame();
  const queue = useQueue();
  const { save, saving, state } = useSave();

  if (loading && !data) return <Loading />;
  if (!data) return <EmptyState suit="♦" title="Couldn't load the data" />;

  const active = activeSeason(data);
  const block = seasonActionBlock({ data, hasLocalGame: local !== null, queued: queue.length });

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Seasons" subtitle="End the season, start the next one, or rename one." />

      {block && (
        <div role="alert" className="ct-panel ct-panel-brass mb-4 flex flex-col gap-2 p-4">
          <p className="font-medium">Season changes are blocked: {block}</p>
          <Link to={local ? "/admin/live" : "/admin"} className={`${btnSecondary} w-full`}>
            {local ? "Back to the game" : "Go to Admin home"}
          </Link>
        </div>
      )}

      {active && <EndSeason data={data} season={active} save={save} saving={saving} blocked={block !== null} />}
      <StartSeason key={data.seasons.length} data={data} active={active} save={save} saving={saving} blocked={block !== null} />
      <SaveStatus state={state} />

      {data.seasons.length > 0 && (
        <section className="ct-panel p-4">
          <h2 className="ct-heading mb-1 text-lg">All seasons</h2>
          <ul className="ct-divided">
            {allSeasonsNewestFirst(data).map((s) => (
              <SeasonRow key={s.id} data={data} season={s} save={save} saving={saving} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
