import { useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { Link, useParams, useViewTransitionState } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AwardsList, BadgeList, NemesisCard, SectionLabel, TitleCard } from "../components/FunPanels.js";
import { TrophyCabinet } from "../components/TrophyCabinet.js";
import { playerTrophies } from "../domain/seasonShow.js";
import { EmptyState, Loading, Money, PageTitle, RankBadge } from "../design/components.js";
import { createOnce, motionReduced } from "../design/motion.js";
import { seasonStandings } from "../domain/standings.js";
import { morphNames } from "../lib/viewTransitions.js";
import { wrappedSeasons } from "../lib/wrappedEntry.js";
import { useData } from "../state/DataContext.js";
import { activeSeason, playerById, todaysLines } from "../lib/selectors.js";
import { netWinningsOverTime } from "../domain/charts.js";
import { allBadges, nemesis, playerSeasonStats, seasonAwards, type Streak } from "../domain/fun.js";
import { formatDate, formatSignedDollars } from "../lib/format.js";
import type { Data } from "../domain/types.js";

const tick = { fontSize: 11, style: { fill: "var(--ct-text-muted)" } };

function Stat({ label, children, to, wide = false }: { label: string; children: ReactNode; to?: string; wide?: boolean }) {
  const body = (
    <>
      <span className="ct-eyebrow block text-[0.7rem] text-ink-muted">{label}</span>
      <span className="mt-1 block text-lg">{children}</span>
    </>
  );
  return to ? (
    <Link to={to} className={`ct-panel ct-focus block p-3 ${wide ? "col-span-2" : ""}`}>
      {body}
    </Link>
  ) : (
    <div className={`ct-panel p-3 ${wide ? "col-span-2" : ""}`}>{body}</div>
  );
}

function streakText(streak: Streak | null): string {
  if (!streak) return "—";
  const word = streak.kind === "win" ? "win" : "loss";
  return `${streak.length} ${streak.length === 1 ? word : `${word}${word === "loss" ? "es" : "s"}`}`;
}

function PlayerSeasonSection({ data, seasonId, playerId, titleRef }: { data: Data; seasonId: string; playerId: string; titleRef: Ref<HTMLElement> }) {
  const points = netWinningsOverTime(data, seasonId, playerId);
  const stats = playerSeasonStats(data, seasonId, playerId);
  const today = todaysLines(data, seasonId).get(playerId);
  const fresh = (today?.mood.tier ?? "freshBlood") === "freshBlood";

  const titleCard = <TitleCard ref={titleRef} today={today} form={stats.form} />;
  if (points.length === 0) {
    return (
      <>
        {titleCard}
        <EmptyState suit="♣" title="No games yet this season">
          Season games show up here once they're played.
        </EmptyState>
      </>
    );
  }

  const net = points[points.length - 1]!.net;
  const { bestNight: best, worstNight: worst } = stats;

  return (
    <>
      {titleCard}
      {/* Fresh blood (under 3 games): rates don't mean much yet, so only the totals. */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Stat label="Season" wide>
          <Money value={net} animate />
        </Stat>
        {!fresh && (
          <>
            <Stat label="Win rate">
              <span className="ct-num font-semibold">{Math.round(stats.winRate * 100)}%</span>
            </Stat>
            <Stat label="Avg per game">
              <Money value={Math.round(stats.avgPerGame)} />
            </Stat>
          </>
        )}
        <Stat label="Best night" to={best ? `/games/${best.gameId}` : undefined}>
          {best ? <Money value={best.result} /> : "—"}
        </Stat>
        <Stat label="Worst night" to={worst ? `/games/${worst.gameId}` : undefined}>
          {worst ? <Money value={worst.result} /> : "—"}
        </Stat>
        {!fresh && (
          <>
            <Stat label="Current streak">
              <span className="font-semibold">{streakText(stats.streak)}</span>
            </Stat>
            <Stat label="Rebuys per game">
              <span className="ct-num font-semibold">{Math.round(stats.rebuysPerGame * 10) / 10}</span>
            </Stat>
          </>
        )}
      </div>

      <div className="ct-panel mb-4 p-3">
        <div className="ct-eyebrow mb-1 text-xs text-ink-muted">Net winnings over the season</div>
        <div className="h-48 w-full text-brass">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={tick} stroke="currentColor" strokeOpacity={0.3} />
              <YAxis tick={tick} tickFormatter={(v) => formatSignedDollars(Number(v))} stroke="currentColor" strokeOpacity={0.3} width={58} />
              <Tooltip
                formatter={(value) => formatSignedDollars(Number(value))}
                labelFormatter={(label) => formatDate(String(label))}
                contentStyle={{
                  background: "var(--ct-felt-hi)",
                  border: "1px solid var(--ct-brass-lo)",
                  borderRadius: 12,
                  color: "var(--ct-text)",
                }}
                itemStyle={{ color: "var(--ct-brass-text)" }}
                labelStyle={{ color: "var(--ct-text-muted)" }}
              />
              <Line type="monotone" dataKey="net" name="Net" stroke="currentColor" strokeWidth={2.5} dot={{ r: 3, fill: "currentColor" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <PlayerAwards data={data} seasonId={seasonId} playerId={playerId} />
      <NemesisCard nemesis={nemesis(data, seasonId, playerId)} />

      <SectionLabel>Games this season</SectionLabel>
      <div className="ct-panel mb-4 overflow-hidden">
        <ul>
          {points
            .slice()
            .reverse()
            .map((p) => (
              <li key={p.gameId}>
                <Link to={`/games/${p.gameId}`} className="ct-list-row ct-focus">
                  <span className="flex-1">{formatDate(p.date)}</span>
                  <Money value={p.result} />
                </Link>
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}

function PlayerAwards({ data, seasonId, playerId }: { data: Data; seasonId: string; playerId: string }) {
  const awards = seasonAwards(data, seasonId);
  if (!Object.values(awards).some((a) => a?.playerIds.includes(playerId))) return null;
  const final = Object.values(awards).some((a) => a?.final);
  return (
    <section className="mb-4" aria-label="Awards">
      <SectionLabel>{final ? "Awards · final" : "Awards · so far"}</SectionLabel>
      <AwardsList data={data} awards={awards} playerId={playerId} />
    </section>
  );
}

const TITLE_FLIP: Keyframe[] = [
  { opacity: 0, transform: "perspective(800px) rotateY(-80deg)" },
  { opacity: 1, transform: "perspective(800px) rotateY(0deg)" },
];

export function PlayerPage() {
  const { id } = useParams();
  const { data, loading } = useData();
  const titleRef = useRef<HTMLElement>(null);
  const flipOnce = useRef(createOnce());
  // Coming from (or going back to) the leaderboard: the header's rank and name morph with that row.
  const morph = useViewTransitionState("/");
  const player = data && id ? playerById(data, id) : undefined;
  const season = data ? activeSeason(data) : undefined;
  const ready = Boolean(player && season);

  // The title card flips in once when the page opens (per player), never on re-renders or a refresh.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || !id || !flipOnce.current(id) || motionReduced()) return;
    el.animate(TITLE_FLIP, { duration: 450, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  }, [id, ready]);

  if (loading && !data) return <Loading />;
  if (!data || !id || !player) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="Player not found" />
      </div>
    );
  }

  const rankIndex = season ? seasonStandings(data, season.id).findIndex((r) => r.playerId === id) : -1;
  const names = morph ? morphNames(id) : null;
  const wrapped = wrappedSeasons(data, id);

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle
        suit="♥"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {rankIndex >= 0 && (
              <span className="inline-flex shrink-0 font-sans text-base" style={names ? { viewTransitionName: names.rank } : undefined}>
                <RankBadge rank={rankIndex + 1} />
              </span>
            )}
            <span className="inline-block min-w-0 break-words" style={names ? { viewTransitionName: names.name } : undefined}>
              {player.name}
            </span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {season ? season.name : "No active season"}
            {player.type === "guest" && <span className="ct-tag">Guest</span>}
            {player.status === "archived" && <span className="ct-tag">Archived</span>}
          </span>
        }
      />
      {season ? (
        <PlayerSeasonSection data={data} seasonId={season.id} playerId={id} titleRef={titleRef} />
      ) : (
        <div className="mb-4">
          <EmptyState suit="♠" title="No active season" />
        </div>
      )}
      {wrapped.length > 0 && (
        <section className="mb-4 flex flex-col gap-2" aria-label="Season Wrapped">
          {wrapped.map((s) => (
            <Link key={s.id} to={`/seasons/${s.id}/wrapped/${id}`} className="ct-btn ct-btn-secondary ct-focus w-full">
              {s.name} Wrapped
            </Link>
          ))}
        </section>
      )}
      <TrophyCabinet trophies={playerTrophies(data, id)} />
      <BadgeList earned={allBadges(data, id)} />
    </div>
  );
}
