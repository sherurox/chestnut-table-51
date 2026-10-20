import type { Change } from "../domain/adminOps.js";
import { finishedGameMessage, startedLiveGameMessage } from "../domain/commitMessages.js";
import { finishGameChange, startMarkerChange, type FinishedEntry } from "../domain/liveGame.js";
import type { Data } from "../domain/types.js";
import type { SaveResult } from "./githubWrite.js";
import { loadLocalGame, loadQueue, removeFromQueue, saveLocalGame } from "./localGame.js";
import { browserStore, type KeyValueStore } from "./localKeys.js";
import { SANDBOX_DEVICE_KEY } from "./sandbox.js";

// Pushes the admin's local state to GitHub (CLAUDE.md §9.2, §9.7): the "Not synced" queue of finished
// games, then a live marker that couldn't be written at start. Runs on login, on opening Admin home, when
// the phone comes back online, and on "Sync now". Only one sync runs at a time. A queued game is removed
// only after GitHub confirms it; a retry after a lost response is a no-op thanks to the duplicate guard
// in finishGameChange (saveChange skips the commit when nothing changes).

export interface SyncDeps {
  save: (change: Change, message: string) => Promise<SaveResult>;
  data: Data | null; // latest data in the app, for names in commit messages
  store?: KeyValueStore | null;
}

export interface SyncedGame {
  entry: FinishedEntry;
  data: Data; // data.json as written (or as found, if it was already saved)
  alreadySaved: boolean;
}

export interface SyncReport {
  synced: SyncedGame[];
  remaining: number;
  error: string | null;
  data: Data | null; // the newest data GitHub confirmed, if anything was saved or checked
}

function messageFor(entry: FinishedEntry, data: Data | null): string {
  const nameOf = (id: string) => data?.players.find((p) => p.id === id)?.name ?? id;
  const season = data?.seasons.find((s) => s.id === entry.game.seasonId);
  return finishedGameMessage({
    date: entry.game.date,
    mode: entry.game.mode,
    seasonName: season?.name ?? "season",
    playerCount: entry.game.players.length,
    promotedNames: entry.game.mode === "season" ? entry.promote.map(nameOf) : [],
  });
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Sync failed.");

export const SANDBOX_BROWSER_MESSAGE =
  "This browser was used for the sandbox, so its games may be sandbox games. Not syncing them to GitHub.";

async function run(deps: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { synced: [], remaining: 0, error: null, data: null };
  // Dev only: a normal dev server must never push a sandbox phone's queue or marker to the real data (§8.6).
  if (import.meta.env.DEV && !__CT51_SANDBOX__ && (deps.store === undefined ? browserStore() : deps.store)?.getItem(SANDBOX_DEVICE_KEY)) {
    report.remaining = loadQueue(deps.store).length;
    report.error = SANDBOX_BROWSER_MESSAGE;
    return report;
  }
  let names = deps.data;

  for (const entry of loadQueue(deps.store)) {
    try {
      const result = await deps.save(finishGameChange(entry), messageFor(entry, names));
      removeFromQueue(entry.game.id, deps.store);
      report.synced.push({ entry, data: result.data, alreadySaved: result.unchanged });
      report.data = names = result.data;
    } catch (err) {
      report.error = errorText(err);
      break; // keep order; try again next time
    }
  }
  report.remaining = loadQueue(deps.store).length;
  if (report.error) return report;

  // A live marker that failed at start (phone offline) is retried here (§9.2).
  const local = loadLocalGame(deps.store);
  if (local && !local.markerSynced) {
    try {
      const result = await deps.save(startMarkerChange(local.id, local.startedAt), startedLiveGameMessage());
      // Re-read so we never overwrite buy-ins autosaved while the request was in flight.
      const latest = loadLocalGame(deps.store);
      if (latest?.id === local.id) saveLocalGame({ ...latest, markerSynced: true }, deps.store);
      report.data = result.data;
    } catch (err) {
      report.error = `Live marker not saved: ${errorText(err)}`;
    }
  }
  return report;
}

let inFlight: Promise<SyncReport> | null = null;

export function syncAll(deps: SyncDeps): Promise<SyncReport> {
  if (!inFlight) inFlight = run(deps).finally(() => (inFlight = null));
  return inFlight;
}
