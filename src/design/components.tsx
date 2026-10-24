import { useEffect, useId, type ReactNode } from "react";
import { formatSignedDollars } from "../lib/format.js";
import { cardLabel, cardRankText, isRedSuit, suitSymbol, type GuideCard } from "../lib/pokerGuide.js";
import { appIconSvg, chipSvg } from "./iconSvg.js";
import { useCountUp, useMotionReduced } from "./motion.js";

// Shared brand components. Styling lives in design.css; these only add structure.

function useSvgId(): string {
  return `ct${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

// The brand chip (brass rim, mahogany edge spots, "51"): same art as the app icon, from iconSvg.ts.
export function ChipBadge({ size = 36 }: { size?: number }) {
  const id = useSvgId();
  return (
    <span
      className="ct-chip-badge inline-block shrink-0 leading-none"
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: chipSvg(size, id) }}
    />
  );
}

// "Chestnut Table" + the brand chip. sm/md: one line (header, page titles). lg: a centred stack, chip on
// top and the name below, so the name never breaks at 360px.
export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="inline-flex flex-col items-center gap-3" role="img" aria-label="Chestnut Table 51">
        <ChipBadge size={96} />
        <span
          className="ct-display font-semibold leading-none whitespace-nowrap"
          style={{ fontSize: "min(2.5rem, 10vw)" }}
          aria-hidden="true"
        >
          Chestnut Table
        </span>
      </span>
    );
  }
  const text = size === "sm" ? "text-lg" : "text-2xl";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" role="img" aria-label="Chestnut Table 51">
      <span className={`ct-display font-semibold leading-none ${text}`} aria-hidden="true">
        Chestnut Table
      </span>
      <ChipBadge size={size === "sm" ? 30 : 40} />
    </span>
  );
}

// Signed money: always shows the sign (+$1,450 / −$300 / $0); colour is never the only signal.
export function Money({ value, animate = false, className = "" }: { value: number; animate?: boolean; className?: string }) {
  const counted = useCountUp(value);
  const shown = animate ? counted : value;
  const tone = value > 0 ? "ct-win" : value < 0 ? "ct-loss" : "";
  return (
    <span className={`ct-num font-semibold ${tone} ${className}`} aria-label={formatSignedDollars(value)}>
      <span aria-hidden="true">{formatSignedDollars(shown)}</span>
    </span>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="ct-rank" data-rank={rank} aria-label={`Rank ${rank}`}>
      {rank}
    </span>
  );
}

export function Crown({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ct-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.55" stopColor="#e1b84a" />
          <stop offset="1" stopColor="#9f7a22" />
        </linearGradient>
      </defs>
      <path
        d="M3 8.5l4.2 3.6L12 4.5l4.8 7.6L21 8.5l-1.8 10H4.8L3 8.5z"
        fill="url(#ct-crown)"
        stroke="#6b4f12"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <rect x="4.6" y="19.2" width="14.8" height="1.8" rx="0.6" fill="#9f7a22" />
    </svg>
  );
}

export function SuitHeading({ suit = "♠", children, as: Tag = "h2" }: { suit?: "♠" | "♥" | "♦" | "♣"; children: ReactNode; as?: "h1" | "h2" | "h3" }) {
  const red = suit === "♥" || suit === "♦";
  return (
    <Tag className="ct-heading">
      <span className={`ct-suit ${red ? "ct-suit-red" : ""}`} aria-hidden="true">
        {suit}
      </span>
      {children}
    </Tag>
  );
}

// Intro splash: under a soft lamp glow the chip drops onto the table, the name and suits rise, then it
// fades out. About 1.2s in total and tap to skip. With reduced motion it is skipped entirely (onDone
// right away, nothing drawn).
export function Splash({ onDone }: { onDone: () => void }) {
  const reduced = useMotionReduced();
  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const timer = setTimeout(onDone, 1200);
    return () => clearTimeout(timer);
  }, [reduced, onDone]);
  if (reduced) return null;
  return (
    <div
      className="ct-app ct-splash fixed inset-0 z-50 grid place-items-center"
      role="status"
      aria-label="Chestnut Table 51"
      onClick={onDone}
    >
      <div className="ct-splash-glow" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-5">
        <span className="ct-splash-chip">
          <ChipBadge size={168} />
        </span>
        <span
          className="ct-splash-name ct-display font-semibold leading-none whitespace-nowrap"
          style={{ fontSize: "min(2.75rem, 11vw)" }}
        >
          Chestnut Table
        </span>
        <span className="ct-splash-suits ct-muted text-xl tracking-[0.6em]" aria-hidden="true">
          ♠ <span className="ct-loss">♥</span> <span className="ct-loss">♦</span> ♣
        </span>
      </div>
    </div>
  );
}

// The app icon (rendered to the PWA PNGs by scripts/render-icons.mjs from the same iconSvg.ts art).
export function AppIconSvg({ size = 128, maskable = false }: { size?: number; maskable?: boolean }) {
  const id = useSvgId();
  return (
    <span
      className="inline-block leading-none"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Chestnut Table 51 app icon"
      dangerouslySetInnerHTML={{ __html: appIconSvg(size, id, maskable) }}
    />
  );
}

// Screen header: display-serif title with a suit, optional subtitle line.
export function PageTitle({ suit = "♠", title, subtitle }: { suit?: "♠" | "♥" | "♦" | "♣"; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-2xl">
        <SuitHeading suit={suit} as="h1">
          {title}
        </SuitHeading>
      </div>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}

// Loading placeholder: the brand chip turning slowly (still with reduced motion).
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink-muted" role="status">
      <span className="ct-spin inline-block">
        <ChipBadge size={44} />
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

// Empty state: a quiet panel that says what's missing and what to do next.
export function EmptyState({ suit = "♣", title, children }: { suit?: "♠" | "♥" | "♦" | "♣"; title: string; children?: ReactNode }) {
  const red = suit === "♥" || suit === "♦";
  return (
    <div className="ct-panel flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span aria-hidden="true" className={`text-3xl ${red ? "text-loss" : "text-brass"}`}>
        {suit}
      </span>
      <p className="ct-display text-lg font-semibold">{title}</p>
      {children && <div className="text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

// A playing card drawn in CSS (no image files): white face, rank in the corner, a large suit, red hearts
// and diamonds. Kickers (cards that aren't part of the hand) are dimmed and say so in their label.
export function PlayingCard({ card }: { card: GuideCard }) {
  const suit = suitSymbol(card.suit);
  return (
    <span className="ct-card" data-red={isRedSuit(card.suit)} data-kicker={card.kicker === true} role="img" aria-label={cardLabel(card)}>
      <span className="ct-card-corner" aria-hidden="true">
        <span>{cardRankText(card.rank)}</span>
        <span>{suit}</span>
      </span>
      <span className="ct-card-pip" aria-hidden="true">
        {suit}
      </span>
    </span>
  );
}
