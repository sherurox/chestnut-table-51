import type { ReactNode } from "react";
import { Money } from "../design/components.js";
import { initials } from "../domain/seasonShow.js";
import { BADGES } from "../lib/funLabels.js";
import { formatSignedDollars } from "../lib/format.js";
import type { WrappedBadge, WrappedSlide } from "../lib/wrapped.js";
import { dateRange, shortDate } from "../lib/wrappedNav.js";
import { KIND_LABEL, TrophyArt } from "./TrophyCabinet.js";

// One Wrapped slide's content (lib/wrapped.ts), centred on its background. Big statements in Playfair,
// Cinzel eyebrows, Inter body; big amounts are signed, coloured and count up when animations are allowed
// (Money). The story (screens/Wrapped.tsx) and #/style both draw slides with this.

const MAX_PILLS = 8;

function Eyebrow({ children }: { children: string }) {
  return <p className="ct-eyebrow text-xs text-[var(--ct-brass-hi)]">{children}</p>;
}

function Big({ children }: { children: ReactNode }) {
  return <p className="ct-display ct-wrapped-big [overflow-wrap:anywhere]">{children}</p>;
}

// Names and titles: smaller than a big number, so one long word still fits a 360px line.
function Name({ children, as: Tag = "p" }: { children: ReactNode; as?: "p" | "h2" }) {
  return <Tag className="ct-display ct-wrapped-name [overflow-wrap:anywhere]">{children}</Tag>;
}

function BigMoney({ value }: { value: number }) {
  return (
    <p className="ct-wrapped-big">
      <Money value={value} animate className="ct-display" />
    </p>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className="ct-display ct-num text-3xl font-bold">{value}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}

function BadgePills({ badges }: { badges: WrappedBadge[] }) {
  if (badges.length === 0) return null;
  const shown = badges.slice(0, MAX_PILLS);
  const more = badges.length - shown.length;
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label="Badges">
      {shown.map((b) => (
        <li key={b.kind} className="ct-wrapped-pill">
          <span aria-hidden="true">{BADGES.find((x) => x.kind === b.kind)?.icon}</span> {b.label}
        </li>
      ))}
      {more > 0 && <li className="ct-wrapped-pill">+{more} more</li>}
    </ul>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function WrappedSlideView({ slide }: { slide: WrappedSlide }) {
  switch (slide.kind) {
    case "intro":
      return (
        <>
          <Eyebrow>Season Wrapped</Eyebrow>
          <Name as="h2">{slide.heading}</Name>
          <div className="grid w-full grid-cols-2 gap-4">
            <Stat value={String(slide.games)} label={slide.games === 1 ? "game played" : "games played"} />
            <Stat value={String(slide.players)} label={slide.players === 1 ? "player" : "players"} />
          </div>
          <p className="text-sm text-ink-muted">{dateRange(slide.startedOn, slide.endedOn)}</p>
        </>
      );
    case "finish":
      return (
        <>
          <Eyebrow>Where you finished</Eyebrow>
          <Big>{slide.placeLabel}</Big>
          <BigMoney value={slide.net} />
          {slide.trophies.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-4">
              {slide.trophies.map((t) => (
                <li key={t.kind} className="flex flex-col items-center gap-1 text-xs font-semibold">
                  <TrophyArt kind={t.kind} />
                  {KIND_LABEL[t.kind]}
                </li>
              ))}
            </ul>
          )}
        </>
      );
    case "bestNight":
      return (
        <>
          <Eyebrow>{slide.heading}</Eyebrow>
          <BigMoney value={slide.result} />
          <p className="text-lg">{shortDate(slide.date)}</p>
          <BadgePills badges={slide.badges} />
        </>
      );
    case "top":
      return (
        <>
          <Eyebrow>{slide.ledAfter > 0 ? "Top of the table" : "Your climb"}</Eyebrow>
          <Big>{slide.ledAfter > 0 ? "#1" : `#${slide.bestRank}`}</Big>
          <p className="ct-display text-2xl leading-snug">{slide.line}</p>
        </>
      );
    case "toughNight":
      return (
        <>
          <Eyebrow>Your tough night</Eyebrow>
          <BigMoney value={slide.result} />
          <p className="text-lg">{shortDate(slide.date)}</p>
          <p className="text-sm text-ink-muted">
            {slide.totalRebuys === 0 ? "No rebuys all season" : `${plural(slide.totalRebuys, "rebuy", "rebuys")} this season`}
          </p>
        </>
      );
    case "nemesis":
      return (
        <>
          <Eyebrow>Your nemesis</Eyebrow>
          <span className="ct-wrapped-disc ct-display" aria-hidden="true">
            {initials(slide.name)}
          </span>
          <Name>{slide.name}</Name>
          <p className="text-base leading-snug">
            Up on {plural(slide.games, "night", "nights")} you were down, taking{" "}
            <span className="ct-num font-semibold text-win">{formatSignedDollars(slide.won)}</span> on those nights.
          </p>
        </>
      );
    case "badges":
      return (
        <>
          <Eyebrow>Your badges</Eyebrow>
          {slide.title && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-ink-muted">Your title</span>
              <Name>{slide.title}</Name>
            </div>
          )}
          {slide.badges.length > 0 ? (
            <BadgePills badges={slide.badges} />
          ) : (
            <p className="text-sm text-ink-muted">No badges this season.</p>
          )}
        </>
      );
    case "finale":
      return (
        <>
          <Eyebrow>Chestnut Table 51</Eyebrow>
          <Name as="h2">{slide.name}</Name>
          <p className="text-sm text-ink-muted">{slide.seasonName}</p>
          <Big>{slide.placeLabel}</Big>
          <BigMoney value={slide.net} />
          <p className="text-sm">
            Best night: <span className="ct-num font-semibold">{formatSignedDollars(slide.bestNight.result)}</span> on{" "}
            {shortDate(slide.bestNight.date)}
          </p>
          {slide.highlight && <span className="ct-wrapped-pill">{slide.highlight}</span>}
        </>
      );
  }
}
