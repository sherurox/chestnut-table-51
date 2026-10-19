import { useEffect, useId, type ReactNode } from "react";
import { formatSignedDollars } from "../lib/format.js";
import { useCountUp, useReducedMotion } from "./motion.js";

// Shared brand components. Styling lives in design.css; these only add structure.

// The brand chip: brass rim with mahogany edge spots, wood centre, "51" in the display serif. One artwork
// for the header, wordmark, splash and app icon. Below 44px the fine details (dotted inlay, spade) are
// dropped and the "51" is set larger so it stays legible.
function ChipArt({ ids, detail }: { ids: { wood: string; brass: string }; detail: boolean }) {
  const spots = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <>
      <defs>
        <radialGradient id={ids.wood} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#6e3620" />
          <stop offset="1" stopColor="#2b150d" />
        </radialGradient>
        <linearGradient id={ids.brass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e2a0" />
          <stop offset="0.5" stopColor="#d6b35e" />
          <stop offset="1" stopColor="#8f6f2c" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="196" fill={`url(#${ids.brass})`} />
      {spots.map((deg) => (
        <rect key={deg} x="236" y="62" width="40" height="44" rx="6" fill="#5b2c19" transform={`rotate(${deg} 256 256)`} />
      ))}
      <circle cx="256" cy="256" r="146" fill={`url(#${ids.wood})`} stroke="#f6e2a0" strokeWidth="6" />
      {detail && (
        <circle cx="256" cy="256" r="126" fill="none" stroke="#d6b35e" strokeWidth="2" strokeDasharray="4 10" opacity="0.8" />
      )}
      <text
        x="256"
        y={detail ? 300 : 310}
        textAnchor="middle"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize={detail ? 148 : 176}
        fill={`url(#${ids.brass})`}
        style={{ fontVariantNumeric: "lining-nums" }}
      >
        51
      </text>
      {detail && (
        <text x="256" y="178" textAnchor="middle" fontSize="34" fill="#f6e2a0" fontFamily="system-ui, sans-serif">
          ♠
        </text>
      )}
    </>
  );
}

function useChipIds() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return { wood: `ct-wood-${id}`, brass: `ct-brass-${id}`, felt: `ct-felt-${id}` };
}

export function ChipBadge({ size = 36 }: { size?: number }) {
  const ids = useChipIds();
  // Crop the 512 artwork to the chip itself (radius 196 around the centre, plus room for the shadow).
  return (
    <svg width={size} height={size} viewBox="56 56 400 400" className="ct-chip-badge shrink-0" aria-hidden="true">
      <ChipArt ids={ids} detail={size >= 44} />
    </svg>
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
  const reduced = useReducedMotion();
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

// The app icon (also rendered to PNG for the PWA manifest): the brand chip on felt. 512×512; the chip
// (radius 196) sits inside the 80% maskable safe zone (radius 205).
export function AppIconSvg({ size = 128, maskable = false }: { size?: number; maskable?: boolean }) {
  const ids = useChipIds();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Chestnut Table 51 app icon">
      <defs>
        <radialGradient id={ids.felt} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#1f5a42" />
          <stop offset="1" stopColor="#0b1d16" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx={maskable ? 0 : 112} fill={`url(#${ids.felt})`} />
      <ChipArt ids={ids} detail />
    </svg>
  );
}
