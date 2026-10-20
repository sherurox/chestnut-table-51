import type { ReactNode } from "react";
import { formatDollars } from "../lib/format.js";
import { muted } from "./ui.js";

// The strict chip check (CLAUDE.md §5.6), shared by the end screen and the edit screen: the exact gap,
// the "missed rebuy?" hint, the other blockers, and a way back to the buy-ins (`fix`) while it fails.
export function ChipCheckPanel({
  totalIn,
  check,
  fix,
}: {
  totalIn: number;
  check: { ok: boolean; allStacksEntered: boolean; gap: number; hint: string | null; blockers: string[] };
  fix: ReactNode;
}) {
  return (
    <section aria-live="polite" className={`ct-panel mb-4 p-4 ${check.ok ? "" : "ct-panel-brass"}`}>
      <h2 className="ct-heading mb-2 text-lg">
        <span className="ct-suit ct-suit-red" aria-hidden="true">
          ♦
        </span>
        Chip check
      </h2>
      <p className={`mb-1 text-sm ${muted}`}>
        Buy-ins <span className="ct-num">{formatDollars(totalIn)}</span>
      </p>
      {check.allStacksEntered && (
        <p className="ct-num mb-2 text-2xl font-bold">
          {check.gap === 0 ? (
            <span className="text-win">✓ Stacks match</span>
          ) : check.gap < 0 ? (
            <span className="text-loss">Short by {formatDollars(-check.gap)}</span>
          ) : (
            <span className="text-loss">Over by {formatDollars(check.gap)}</span>
          )}
        </p>
      )}
      {check.allStacksEntered && check.hint && <p className="mb-2 font-medium">{check.hint}</p>}
      {check.blockers.length > 0 && (
        <ul className={`mb-2 list-disc pl-5 text-sm ${muted}`}>
          {check.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {!check.ok && fix}
    </section>
  );
}
