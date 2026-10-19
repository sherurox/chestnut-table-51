import { useEffect, useState } from "react";
import { EmptyState, Loading, PageTitle } from "../design/components.js";
import { IconChevron } from "../design/icons.js";
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
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Edit history" subtitle="Every save is a commit on GitHub. Tap one to see exactly what changed." />
      {error && (
        <EmptyState suit="♦" title="Couldn't load the history">
          {error}
        </EmptyState>
      )}
      {!error && !commits && <Loading />}
      {commits && commits.length === 0 && <EmptyState suit="♣" title="No history yet" />}
      {commits && commits.length > 0 && (
        <div className="ct-panel overflow-hidden">
          <ul>
            {commits.map((c) => (
              <li key={c.sha}>
                <a href={c.url} target="_blank" rel="noreferrer" className="ct-list-row ct-focus">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm break-words">{c.message}</span>
                    <span className="block text-xs text-ink-muted">{formatDateTime(c.date)}</span>
                  </span>
                  <span className="text-ink-muted">
                    <IconChevron />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
