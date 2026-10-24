import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SectionLabel } from "../components/FunPanels.js";
import { Crown, EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import type { Award } from "../domain/fun.js";
import type { Data } from "../domain/types.js";
import { formatDate, formatDollars } from "../lib/format.js";
import { awardValue } from "../lib/funLabels.js";
import { hallOfFame, phraseText, type Holder } from "../lib/hallOfFame.js";
import { useData } from "../state/DataContext.js";

// Every title, badge, award and phrase with its rule and who holds it (lib/hallOfFame.ts).

function PlayerLink({ holder, children }: { holder: Holder; children?: ReactNode }) {
  return (
    <Link to={`/players/${holder.playerId}`} className="ct-focus inline-flex min-h-[48px] items-center rounded-lg px-1 font-medium break-words">
      <span className="underline underline-offset-2">{holder.name}</span>
      {children}
    </Link>
  );
}

function Holders({ holders, none = "Nobody right now" }: { holders: Holder[]; none?: string }) {
  if (holders.length === 0) return <span className="text-sm text-ink-muted">{none}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {holders.map((h) => (
        <PlayerLink key={h.playerId} holder={h} />
      ))}
    </span>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-6" aria-label={label}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

function AwardHolders({ data, label, award }: { data: Data; label: string; award: Award | null }) {
  const holders = (award?.playerIds ?? []).map((id) => ({ playerId: id, name: data.players.find((p) => p.id === id)?.name ?? "?" }));
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex flex-wrap items-center gap-x-2">
        <Holders holders={holders} none="Nobody" />
        {award && <span className="ct-num text-sm">{awardValue(award.kind, award.value)}</span>}
      </span>
    </div>
  );
}

export function HallOfFame() {
  const { data, loading } = useData();
  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <div className="p-4">
        <EmptyState suit="♣" title="No data yet" />
      </div>
    );
  }

  const hall = hallOfFame(data);
  const seasonName = hall.season?.name ?? "No active season";

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♣" title="Hall of Fame" subtitle="Titles, badges, awards and phrases" />

      <Section label={`Titles · ${seasonName}`}>
        {hall.typicalBuyIn !== null && (
          <p className="mb-2 text-sm text-ink-muted">A typical buy-in this season is {formatDollars(hall.typicalBuyIn)} (the most common first buy-in).</p>
        )}
        <ul className="ct-panel ct-divided overflow-hidden">
          {hall.titles.map((t) => (
            <li key={t.tier} className="flex flex-col gap-1 px-3 py-2.5">
              <span className="ct-display font-semibold">{t.name}</span>
              <span className="text-sm text-ink-muted">{t.rule}</span>
              <Holders holders={t.holders} />
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Situational titles · today">
        <p className="mb-2 text-sm text-ink-muted">Shown instead of the title while they apply. Only one at a time: the first that applies, in this order.</p>
        <ul className="ct-panel ct-divided overflow-hidden">
          {hall.situations.map((s) => (
            <li key={s.situation} className="flex flex-col gap-1 px-3 py-2.5">
              <span className="ct-display font-semibold">{s.name}</span>
              <span className="text-sm text-ink-muted">{s.rule}</span>
              <Holders holders={s.holders} />
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Badges · all-time, season games only">
        <ul className="ct-panel ct-divided overflow-hidden">
          {hall.badges.map((b) => {
            const earned = b.holders.length > 0;
            return (
              <li key={b.kind} className="flex gap-3 px-3 py-2.5">
                <span className="ct-badge-icon" data-earned={earned ? "true" : undefined} aria-hidden="true">
                  <span>{b.icon}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`font-semibold ${earned ? "" : "text-ink-muted"}`}>
                    {b.name}
                    {!earned && <span className="sr-only"> (nobody has earned it yet)</span>}
                  </span>
                  <span className="text-sm text-ink-muted">{b.howToEarn}</span>
                  {earned ? (
                    <span className="flex flex-wrap items-center gap-x-3">
                      {b.holders.map((h) => (
                        <PlayerLink key={h.playerId} holder={h}>
                          <span className="ms-1 text-xs font-normal text-ink-muted">
                            {h.count > 1 ? `×${h.count}, first ` : ""}
                            {formatDate(h.date)}
                          </span>
                        </PlayerLink>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-muted">Not earned yet</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section label="Awards">
        <ul className="ct-panel ct-divided overflow-hidden">
          {hall.awards.map((a) => (
            <li key={a.kind} className="flex flex-col gap-1 px-3 py-2.5">
              <span className="ct-display font-semibold">{a.name}</span>
              <span className="text-sm text-ink-muted">{a.description}</span>
              {hall.season && <AwardHolders data={data} label={`${hall.season.name} · so far`} award={a.current} />}
              {hall.lastClosed && <AwardHolders data={data} label={`${hall.lastClosed.name} · final`} award={a.lastClosed} />}
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Phrases">
        <p className="mb-2 text-sm text-ink-muted">Each player gets one line a day from their title's pool.</p>
        <div className="ct-panel ct-divided overflow-hidden">
          {hall.phrases.map((p) => (
            <details key={p.pool} className="ct-details">
              <summary className="ct-focus flex min-h-[48px] cursor-pointer items-center gap-2 px-3">
                <span className="flex-1 font-semibold">{p.name}</span>
                <span className="text-xs text-ink-muted">{`${p.lines.length} lines`}</span>
              </summary>
              <ul className="flex flex-col gap-1.5 px-3 pb-3 text-sm">
                {p.lines.map((line) => (
                  <li key={line} className="break-words">
                    {phraseText(line)}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Section>

      <Section label="Season champions">
        {hall.champions.length === 0 ? (
          <EmptyState suit="♦" title="No closed seasons yet" />
        ) : (
          <ul className="ct-panel ct-divided overflow-hidden">
            {hall.champions.map((c) => (
              <li key={c.season.id} className="flex min-h-[56px] flex-wrap items-center gap-x-3 px-3 py-1">
                <Crown className="h-5 w-5 shrink-0" />
                <Link to={`/seasons/${c.season.id}`} className="ct-focus inline-flex min-h-[48px] items-center font-semibold break-words">
                  {c.season.name}
                </Link>
                <PlayerLink holder={c} />
                <Money value={c.net} className="ms-auto text-sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
