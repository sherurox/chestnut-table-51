import { useRef, type CSSProperties, type ReactNode } from "react";
import { Link, useViewTransitionState } from "react-router-dom";
import { Crown, Money, RankBadge } from "../design/components.js";
import { useFlip } from "../design/motion.js";
import type { RankChange } from "../domain/highlights.js";
import type { StandingsRow } from "../domain/standings.js";
import type { ID } from "../domain/types.js";
import { morphNames, useViewTransitionTo } from "../lib/viewTransitions.js";

// ▲n / ▼n / NEW since the last season game. The arrow and number are the signal; colour only adds to it.
// `pulse`: once, after a new game (Home only).
function RankMove({ change, pulse }: { change: RankChange; pulse: boolean }) {
  const p = pulse ? "ct-pulse" : "";
  if (change.kind === "new") {
    return <span className={`ct-tag ct-tag-brass shrink-0 text-[0.65rem] ${p}`}>NEW</span>;
  }
  const up = change.kind === "up";
  return (
    <span
      className={`ct-num shrink-0 text-xs font-semibold ${up ? "text-win" : "text-loss"} ${p}`}
      aria-label={`${up ? "Up" : "Down"} ${change.by} since the last game`}
    >
      <span aria-hidden="true">
        {up ? "▲" : "▼"}
        {change.by}
      </span>
    </span>
  );
}

// Leaderboard row → player page: only while that player's own transition runs (either direction) do the
// rank badge and name carry the view-transition-names the player page header uses, so they morph into it.
function RowLink({ playerId, morph, children }: { playerId: ID; morph: boolean; children: (names: ReturnType<typeof morphNames> | null) => ReactNode }) {
  const to = `/players/${playerId}`;
  const transitionTo = useViewTransitionTo();
  const transitioning = useViewTransitionState(to);
  return (
    <Link
      to={to}
      viewTransition={morph && transitionTo(to)}
      className="ct-focus flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-3 py-2"
    >
      {children(morph && transitioning ? morphNames(playerId) : null)}
    </Link>
  );
}

// Ranked standings (leaderboard, season detail). Rows rise in with a stagger, amounts count up, and
// rows slide to their new place when the order changes after a refresh. Names and lines wrap, never
// truncate. `lines` (leaderboard only) adds today's line under each row, full width. `morph` (leaderboard
// only): tapping a row morphs its rank and name into the player page. `pulse`: rank arrows pulse once.
export function StandingsList({
  rows,
  me,
  championId = null,
  changes,
  lines,
  morph = false,
  pulse = false,
}: {
  rows: StandingsRow[];
  me: ID | null;
  championId?: ID | null;
  changes?: Map<ID, RankChange>;
  lines?: Map<ID, string>;
  morph?: boolean;
  pulse?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, [rows.map((r) => r.playerId).join(",")]);

  return (
    <div className="ct-panel overflow-hidden">
      <ol ref={list}>
        {rows.map((row, i) => {
          const isMe = row.playerId === me;
          const change = changes?.get(row.playerId);
          const line = lines?.get(row.playerId);
          return (
            <li
              key={row.playerId}
              data-flip={row.playerId}
              className={`ct-row ct-rise p-0 ${isMe ? "ct-row-me" : ""}`}
              style={{ "--i": Math.min(i, 10) } as CSSProperties}
            >
              <RowLink playerId={row.playerId} morph={morph}>
                {(names) => (
                  <>
                    <span className="inline-flex shrink-0" style={names ? { viewTransitionName: names.rank } : undefined}>
                      <RankBadge rank={i + 1} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-1.5 font-medium break-words">
                            <span className="min-w-0 break-words" style={names ? { viewTransitionName: names.name } : undefined}>
                              {row.name}
                            </span>
                            {change && <RankMove change={change} pulse={pulse} />}
                            {row.playerId === championId && <Crown className="h-4 w-4 shrink-0" />}
                            {isMe && <span className="text-xs font-semibold text-brass">YOU</span>}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {row.gamesPlayed} game{row.gamesPlayed === 1 ? "" : "s"}
                          </span>
                        </span>
                        <Money value={row.net} animate className="shrink-0 text-lg" />
                      </span>
                      {line && <span className="ct-line mt-1 block">{line}</span>}
                    </span>
                  </>
                )}
              </RowLink>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
