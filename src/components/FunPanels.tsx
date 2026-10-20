import { Link } from "react-router-dom";
import { Money } from "../design/components.js";
import type { Award, AwardKind, Badge, FormMark, Nemesis } from "../domain/fun.js";
import type { Data, ID } from "../domain/types.js";
import { AWARDS, BADGES, SITUATION_NAMES, TIER_NAMES, awardValue, formLabel } from "../lib/funLabels.js";
import type { TodaysLine } from "../lib/selectors.js";
import { shareDate } from "../lib/share.js";

// Stats-engine panels (domain/fun.ts) for the player and season pages. Display only.

const FRESH_BLOOD_GAMES = 3;

function namesOf(data: Data, ids: ID[]): string {
  const names = ids.map((id) => data.players.find((p) => p.id === id)?.name ?? "?");
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : (names[0] ?? "");
}

export function SectionLabel({ children }: { children: string }) {
  return <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{children}</h2>;
}

// Last 5 results as dots, oldest first. The letter is the signal; colour only adds to it.
export function FormDots({ form }: { form: FormMark[] }) {
  if (form.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5" role="img" aria-label={formLabel(form)}>
      {form.map((m, i) => (
        <span key={i} className="ct-form-dot" data-mark={m} aria-hidden="true">
          {m}
        </span>
      ))}
    </span>
  );
}

// Tier or situation name, today's line and recent form. `today` is undefined when the player has no
// leaderboard row this season (a guest or archived player with no season games).
export function TitleCard({ today, form }: { today: TodaysLine | undefined; form: FormMark[] }) {
  const tier = today?.mood.tier ?? "freshBlood";
  const situation = today?.mood.situation ?? null;
  const games = today?.mood.stats.games ?? 0;
  const fresh = tier === "freshBlood";
  const toGo = FRESH_BLOOD_GAMES - games;

  return (
    <section className="ct-panel ct-panel-brass mb-4 flex flex-col gap-2 p-4" aria-label="Title">
      <span className="flex flex-wrap items-center gap-2">
        <span className="ct-display text-xl font-semibold">{situation ? SITUATION_NAMES[situation] : TIER_NAMES[tier]}</span>
        {situation && <span className="ct-tag">{TIER_NAMES[tier]}</span>}
      </span>
      {today && <p className="ct-line text-sm">{today.line}</p>}
      {fresh && (
        <p className="text-sm text-ink-muted">
          Play {FRESH_BLOOD_GAMES} games to get a title{games > 0 ? ` (${toGo} to go)` : ""}.
        </p>
      )}
      {form.length > 0 && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          Form
          <FormDots form={form} />
        </span>
      )}
    </section>
  );
}

export function NemesisCard({ nemesis }: { nemesis: Nemesis | null }) {
  if (!nemesis) return null;
  return (
    <section className="mb-4" aria-label="Nemesis">
      <SectionLabel>Nemesis</SectionLabel>
      <Link to={`/players/${nemesis.playerId}`} className="ct-panel ct-focus flex min-h-[56px] flex-col gap-1 p-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold break-words">{nemesis.name}</span>
          <span className="ct-tag">Just for fun</span>
        </span>
        <span className="text-sm text-ink-muted">
          Finished up {nemesis.games} times when you finished down, winning{" "}
          <Money value={nemesis.won} className="text-sm" /> on those nights.
        </span>
      </Link>
    </section>
  );
}

// One award: name, holder(s), the number behind it and what it's for. Ties are shared.
function AwardRow({ data, award, name, description, showHolders }: { data: Data; award: Award; name: string; description: string; showHolders: boolean }) {
  const shared = award.playerIds.length > 1;
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="ct-display font-semibold">{name}</span>
        {shared && <span className="ct-tag ct-tag-brass">Shared</span>}
      </span>
      {showHolders && <span className="font-medium break-words">{namesOf(data, award.playerIds)}</span>}
      <span className="ct-num text-sm">{awardValue(award.kind, award.value)}</span>
      <span className="text-xs text-ink-muted">{description}</span>
    </li>
  );
}

// Awards in the fixed AWARDS order, skipping ones nobody holds. `playerId` limits it to that player's.
export function AwardsList({
  data,
  awards,
  playerId,
}: {
  data: Data;
  awards: Record<AwardKind, Award | null>;
  playerId?: ID;
}) {
  const held = AWARDS.flatMap((a) => {
    const award = awards[a.kind];
    if (!award || (playerId && !award.playerIds.includes(playerId))) return [];
    return [{ ...a, award }];
  });
  if (held.length === 0) return null;
  return (
    <ul className="ct-panel ct-divided overflow-hidden">
      {held.map((a) => (
        <AwardRow key={a.kind} data={data} award={a.award} name={a.name} description={a.description} showHolders={!playerId} />
      ))}
    </ul>
  );
}

// Every badge: earned ones with the date (tap through to the game), the rest muted with how to earn them.
export function BadgeList({ earned }: { earned: Badge[] }) {
  const byKind = new Map(earned.map((b) => [b.kind, b]));
  return (
    <section className="mb-4" aria-label="Badges">
      <SectionLabel>{`Badges · ${earned.length} of ${BADGES.length} · all-time`}</SectionLabel>
      <ul className="ct-panel overflow-hidden">
        {BADGES.map((b) => {
          const badge = byKind.get(b.kind);
          return (
            <li key={b.kind}>
              {badge ? (
                <Link to={`/games/${badge.gameId}`} className="ct-list-row ct-focus">
                  <span className="ct-badge-icon" data-earned="true" aria-hidden="true">
                    ★
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{b.name}</span>
                    <span className="block text-xs text-ink-muted">Earned {shareDate(badge.date)}</span>
                  </span>
                </Link>
              ) : (
                <div className="ct-list-row">
                  <span className="ct-badge-icon" aria-hidden="true">
                    ☆
                  </span>
                  <span className="min-w-0 flex-1 text-ink-muted">
                    <span className="block font-medium">
                      {b.name} <span className="sr-only">(not earned yet)</span>
                    </span>
                    <span className="block text-xs">{b.howToEarn}</span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
