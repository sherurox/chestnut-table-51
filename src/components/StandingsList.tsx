import { useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Crown, Money, RankBadge } from "../design/components.js";
import { useFlip } from "../design/motion.js";
import type { StandingsRow } from "../domain/standings.js";
import type { ID } from "../domain/types.js";

// Ranked standings (leaderboard, season detail). Rows rise in with a stagger, amounts count up, and
// rows slide to their new place when the order changes after a refresh. Names wrap, never truncate.
export function StandingsList({ rows, me, championId = null }: { rows: StandingsRow[]; me: ID | null; championId?: ID | null }) {
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, [rows.map((r) => r.playerId).join(",")]);

  return (
    <div className="ct-panel overflow-hidden">
      <ol ref={list}>
        {rows.map((row, i) => {
          const isMe = row.playerId === me;
          return (
            <li
              key={row.playerId}
              data-flip={row.playerId}
              className={`ct-row ct-rise p-0 ${isMe ? "ct-row-me" : ""}`}
              style={{ "--i": Math.min(i, 10) } as CSSProperties}
            >
              <Link to={`/players/${row.playerId}`} className="ct-focus flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-3 py-2">
                <RankBadge rank={i + 1} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium break-words">
                    {row.name}
                    {row.playerId === championId && <Crown className="h-4 w-4 shrink-0" />}
                    {isMe && <span className="text-xs font-semibold text-brass">YOU</span>}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {row.gamesPlayed} game{row.gamesPlayed === 1 ? "" : "s"}
                  </span>
                </span>
                <Money value={row.net} animate className="shrink-0 text-lg" />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
