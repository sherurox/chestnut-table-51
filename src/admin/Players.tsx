import { EmptyState, Loading, PageTitle } from "../design/components.js";
import { useState, type FormEvent } from "react";
import {
  addPlayer,
  archivePlayer,
  promoteGuest,
  renamePlayer,
  unarchivePlayer,
} from "../domain/adminOps.js";
import {
  addedPlayerMessage,
  archivedPlayerMessage,
  promotedGuestMessage,
  renamedPlayerMessage,
  unarchivedPlayerMessage,
} from "../domain/commitMessages.js";
import { newId } from "../domain/ids.js";
import type { Player } from "../domain/types.js";
import { useData } from "../state/DataContext.js";
import { SaveStatus, btnPrimary, btnSecondary, input, muted, useSave } from "./ui.js";

type Save = ReturnType<typeof useSave>["save"];

function byName(a: Player, b: Player): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function AddPlayerForm({ save, saving }: { save: Save; saving: boolean }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Player["type"]>("regular");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const ok = await save(
      addPlayer({ id: newId(), name: trimmed, type, now: new Date().toISOString() }),
      addedPlayerMessage(trimmed, type),
      `Added ${trimmed}.`,
    );
    if (ok) setName("");
  }

  return (
    <form onSubmit={onSubmit} className="mb-2 flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span>New player name</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <fieldset className="flex gap-2">
        <legend className="sr-only">Player type</legend>
        {(["regular", "guest"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`${btnSecondary} ct-choice flex-1`}
          >
            {t === "regular" ? "Regular" : "Guest"}
          </button>
        ))}
      </fieldset>
      <button type="submit" className={btnPrimary} disabled={saving || name.trim().length === 0}>
        Add player
      </button>
    </form>
  );
}

function PlayerRow({ player, save, saving }: { player: Player; save: Save; saving: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(player.name);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    const ok = await save(
      renamePlayer(player.id, trimmed),
      renamedPlayerMessage(player.name, trimmed),
      `Renamed ${player.name} to ${trimmed}.`,
    );
    if (ok) setRenaming(false);
  }

  if (renaming) {
    return (
      <li className="py-2">
        <form onSubmit={onRename} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span>Rename {player.name}</span>
            <input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={saving || newName.trim().length === 0}>
              Save name
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={() => {
                setRenaming(false);
                setNewName(player.name);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  const archived = player.status === "archived";
  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{player.name}</span>
        {player.type === "guest" && <span className={`text-xs ${muted}`}>Guest</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} disabled={saving} onClick={() => setRenaming(true)}>
          Rename
        </button>
        {archived ? (
          <button
            type="button"
            className={btnSecondary}
            disabled={saving}
            onClick={() => save(unarchivePlayer(player.id), unarchivedPlayerMessage(player.name), `Unarchived ${player.name}.`)}
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            className={btnSecondary}
            disabled={saving}
            onClick={() => save(archivePlayer(player.id), archivedPlayerMessage(player.name), `Archived ${player.name}.`)}
          >
            Archive
          </button>
        )}
        {player.type === "guest" && (
          <button
            type="button"
            className={btnSecondary}
            disabled={saving}
            onClick={() =>
              save(promoteGuest(player.id), promotedGuestMessage(player.name), `${player.name} is now a regular.`)
            }
          >
            Promote to regular
          </button>
        )}
      </div>
    </li>
  );
}

export function Players() {
  const { data, loading } = useData();
  const { save, saving, state } = useSave();

  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="No data yet" />
      </div>
    );
  }

  const active = data.players.filter((p) => p.status === "active").sort(byName);
  const archived = data.players.filter((p) => p.status === "archived").sort(byName);

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♥" title="Players" subtitle="Add, rename, archive, or promote a guest to regular." />
      <AddPlayerForm save={save} saving={saving} />
      <SaveStatus state={state} />

      <h2 className="mt-4 font-semibold">Active</h2>
      {active.length === 0 ? (
        <p className={`py-2 text-sm ${muted}`}>No players yet. Add the first one above.</p>
      ) : (
        <ul className="ct-divided">
          {active.map((p) => (
            <PlayerRow key={p.id} player={p} save={save} saving={saving} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <h2 className="mt-4 font-semibold">Archived</h2>
          <p className={`text-sm ${muted}`}>Hidden from pickers; their history is kept.</p>
          <ul className="ct-divided">
            {archived.map((p) => (
              <PlayerRow key={p.id} player={p} save={save} saving={saving} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
