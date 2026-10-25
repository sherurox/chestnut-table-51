import { Link } from "react-router-dom";
import { SectionLabel } from "./FunPanels.js";
import { Money } from "../design/components.js";
import type { Trophy, TrophyKind } from "../domain/seasonShow.js";
import { formatSignedDollars } from "../lib/format.js";

// The trophy cabinet on a player's page: one trophy per closed-season Champion/Podium/Wooden spoon badge
// (playerTrophies), newest first, three to a wooden shelf. Each trophy opens its season.

const PER_SHELF = 3;
export const KIND_LABEL: Record<TrophyKind, string> = {
  gold: "Champion",
  silver: "2nd place",
  bronze: "3rd place",
  spoon: "Wooden spoon",
};

function Cup() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
      <defs>
        <linearGradient id="ct-trophy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor="#e1b84a" />
          <stop offset="1" stopColor="#9c7a34" />
        </linearGradient>
      </defs>
      <path d="M14 11H8.5c0 6.5 3.5 10 7.5 10M34 11h5.5c0 6.5-3.5 10-7.5 10" fill="none" stroke="#d6b35e" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M13 6h22v10c0 7.7-4.9 13-11 13s-11-5.3-11-13z" fill="url(#ct-trophy-gold)" />
      <path d="M17 9v6c0 3 1 5.5 2.5 7" fill="none" stroke="#fff6d2" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M21.5 29h5v6h-5z" fill="#c89f45" />
      <path d="M16 35h16v4H16z" fill="url(#ct-trophy-gold)" />
      <path d="M13 39h22v4H13z" fill="#9c7a34" />
    </svg>
  );
}

const MEDAL = {
  silver: { hi: "#ffffff", mid: "#c3cad2", lo: "#87909a", ink: "#1c2329", n: "2" },
  bronze: { hi: "#f8d2b0", mid: "#c98552", lo: "#8a4f2a", ink: "#2a1408", n: "3" },
} as const;

function Medal({ kind }: { kind: "silver" | "bronze" }) {
  const m = MEDAL[kind];
  const id = `ct-trophy-${kind}`;
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.hi} />
          <stop offset="0.5" stopColor={m.mid} />
          <stop offset="1" stopColor={m.lo} />
        </linearGradient>
      </defs>
      <path d="M14 3h8l5 16h-8z" fill="#7a1f2b" />
      <path d="M34 3h-8l-5 16h8z" fill="#1d7a52" />
      <circle cx="24" cy="31" r="13" fill={`url(#${id})`} />
      <circle cx="24" cy="31" r="9.5" fill="none" stroke={m.hi} strokeWidth="1.2" opacity="0.8" />
      <text x="24" y="36.5" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" fontSize="15" fill={m.ink}>
        {m.n}
      </text>
    </svg>
  );
}

function Spoon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
      <defs>
        <linearGradient id="ct-trophy-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e2a868" />
          <stop offset="0.55" stopColor="#b9773d" />
          <stop offset="1" stopColor="#7a4a22" />
        </linearGradient>
      </defs>
      <path d="M22.5 22.5 41 41" stroke="#a5652f" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M22.5 22.5 41 41" stroke="#d99c5c" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <ellipse cx="15" cy="15" rx="8" ry="11.5" transform="rotate(-45 15 15)" fill="url(#ct-trophy-wood)" />
      <ellipse cx="14" cy="14" rx="4.5" ry="7.5" transform="rotate(-45 14 14)" fill="#7a4a22" opacity="0.35" />
    </svg>
  );
}

export function TrophyArt({ kind }: { kind: TrophyKind }) {
  if (kind === "gold") return <Cup />;
  if (kind === "spoon") return <Spoon />;
  return <Medal kind={kind} />;
}

export function TrophyCabinet({ trophies }: { trophies: Trophy[] }) {
  const shelves: Trophy[][] = [];
  for (let i = 0; i < trophies.length; i += PER_SHELF) shelves.push(trophies.slice(i, i + PER_SHELF));

  return (
    <section className="mb-4" aria-label="Trophy cabinet">
      <SectionLabel>Trophy cabinet</SectionLabel>
      <div className="ct-cabinet">
        {shelves.length === 0 ? (
          <p className="p-4 text-sm">No trophies yet. They're handed out when a season closes.</p>
        ) : (
          shelves.map((shelf, s) => (
            <ul key={s} className="ct-cabinet-shelf">
              {shelf.map((t) => (
                <li key={`${t.seasonId}-${t.kind}`} className="min-w-0">
                  <Link to={`/seasons/${t.seasonId}`} className="ct-cabinet-trophy ct-focus">
                    <TrophyArt kind={t.kind} />
                    <span className="sr-only">{`${KIND_LABEL[t.kind]}, ${t.seasonName}, ${formatSignedDollars(t.net)}`}</span>
                    <span className="w-full text-xs leading-tight font-semibold [overflow-wrap:anywhere]" aria-hidden="true">
                      {t.seasonName}
                    </span>
                    <span aria-hidden="true">
                      <Money value={t.net} className="text-xs" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))
        )}
      </div>
    </section>
  );
}
