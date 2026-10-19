import { useEffect, useState } from "react";
import { fetchCommitHistory, type CommitEntry } from "../storage/github.js";
import { formatDateTime } from "../lib/format.js";

export function EditHistory() {
  const [commits, setCommits] = useState<CommitEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommitHistory()
      .then(setCommits)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Edit history</h1>
      {error && <p className="text-chestnut-400">{error}</p>}
      {!error && !commits && <p>Loading…</p>}
      {commits && commits.length === 0 && <p>No history yet.</p>}
      {commits && commits.length > 0 && (
        <ul className="divide-y divide-felt-700/20">
          {commits.map((c) => (
            <li key={c.sha} className="min-h-[48px] py-2">
              <a href={c.url} target="_blank" rel="noreferrer" className="block">
                <div className="text-sm">{c.message}</div>
                <div className="text-xs text-felt-950/60 dark:text-white/50">
                  {formatDateTime(c.date)}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
