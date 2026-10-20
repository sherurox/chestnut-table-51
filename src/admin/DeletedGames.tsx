import { Link } from "react-router-dom";
import { EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { seasonActionBlock } from "../domain/adminOps.js";
import { restoredGameMessage } from "../domain/commitMessages.js";
import { deletedGames, restoreGameChange } from "../domain/gameEdits.js";
import { gameResult } from "../domain/results.js";
import type { Data, Game } from "../domain/types.js";
import { formatDate, formatDateTime } from "../lib/format.js";
import { championChangeLine, gameSummary } from "../lib/gameEditText.js";
import { playerById, seasonById } from "../lib/selectors.js";
import { useData } from "../state/DataContext.js";
import { useLocalGame, useQueue } from "./localHooks.js";
import { ConfirmButton, SaveStatus, btnPrimary, btnSecondary, muted, useSave } from "./ui.js";

type Save = ReturnType<typeof useSave>["save"];

function DeletedGame({ data, game, save, saving, blocked }: { data: Data; game: Game; save: Save; saving: boolean; blocked: boolean }) {
  const season = seasonById(data, game.seasonId);
  const seasonName = season?.name ?? "Unknown season";
  const results = game.players
    .map((pid) => ({ pid, name: playerById(data, pid)?.name ?? pid, result: gameResult(game, pid) }))
    .sort((a, b) => b.result - a.result || a.name.localeCompare(b.name));
  let closedLine = "";
  if (season?.status === "closed") {
    try {
      closedLine = ` ${championChangeLine(data, restoreGameChange(game.id)(data), season, "restore")}`;
    } catch {
      // the restore itself will report why it can't apply
    }
  }

  return (
    <li className="ct-panel flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="ct-display text-lg font-semibold">{formatDate(game.date)}</span>
        <span className="flex flex-wrap gap-1.5">
          <span className="ct-tag">{seasonName}</span>
          {game.mode === "incognito" && <span className="ct-tag">♣ Incognito</span>}
          {game.editedAt && <span className="ct-tag ct-tag-brass">Edited</span>}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {results.map((r) => (
          <li key={r.pid} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 break-words">{r.name}</span>
            <Money value={r.result} className="shrink-0 text-sm" />
          </li>
        ))}
      </ul>
      {game.deletedAt && <p className={`text-sm ${muted}`}>Deleted {formatDateTime(game.deletedAt)}</p>}
      <ConfirmButton
        label="Restore"
        className={btnPrimary}
        disabled={saving || blocked}
        prompts={[`Restore ${gameSummary(data, game)}?${closedLine}`]}
        confirmLabel="Yes, restore game"
        onConfirm={() => void save(restoreGameChange(game.id), restoredGameMessage(game.date, seasonName), `Restored the ${formatDate(game.date)} game.`)}
      />
    </li>
  );
}

// #/admin/deleted: the deleted-games bin (CLAUDE.md §5.9). Restore brings a game back exactly as it was.
export function DeletedGames() {
  const { data, loading } = useData();
  const local = useLocalGame();
  const queue = useQueue();
  const { save, saving, state } = useSave();

  if (loading && !data) return <Loading />;
  if (!data) return <EmptyState suit="♦" title="Couldn't load the data" />;

  const games = deletedGames(data);
  const block = seasonActionBlock({ data, hasLocalGame: local !== null, queued: queue.length });

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Deleted games" subtitle="Deleted games don't count anywhere. Restore one to bring it back exactly as it was." />

      {block && (
        <div role="alert" className="ct-panel ct-panel-brass mb-4 flex flex-col gap-2 p-4">
          <p className="font-medium">Restoring is blocked: {block}</p>
          <Link to={local ? "/admin/live" : "/admin"} className={`${btnSecondary} w-full`}>
            {local ? "Back to the game" : "Go to Admin home"}
          </Link>
        </div>
      )}

      <SaveStatus state={state} />
      {games.length === 0 ? (
        <EmptyState suit="♦" title="No deleted games">
          Games you delete show up here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((g) => (
            <DeletedGame key={g.id} data={data} game={g} save={save} saving={saving} blocked={block !== null} />
          ))}
        </ul>
      )}
    </div>
  );
}
