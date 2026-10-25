import { useState } from "react";
import { Crown, Money } from "../design/components.js";
import { motionReduced } from "../design/motion.js";
import type { SeasonPodium as Podium } from "../domain/seasonShow.js";
import { formatSignedDollars } from "../lib/format.js";

// The season's top 3 on a CSS 3D podium (2 · 1 · 3), gold tallest. The DOM is in place order (1, 2, 3)
// for screen readers; flex `order` puts #1 in the middle. Steps rise once per mount (staggered 1, 2, 3)
// only when animations are allowed; otherwise they are simply there.

const PLACE_WORD = { 1: "1st", 2: "2nd", 3: "3rd" } as const;
const METAL = { 1: "gold", 2: "silver", 3: "bronze" } as const;

export function SeasonPodium({ podium }: { podium: Podium }) {
  const [rise] = useState(() => !motionReduced());
  return (
    <ol className="ct-podium">
      {podium.places.map((p) => (
        <li
          key={p.playerId}
          className={`ct-podium-place ${rise ? "ct-podium-rise" : ""}`}
          data-place={p.place}
        >
          <span className="sr-only">{`${PLACE_WORD[p.place]} place, ${p.name}, ${formatSignedDollars(p.net)}`}</span>
          <div className="flex w-full flex-col items-center gap-1 pb-2 text-center" aria-hidden="true">
            {p.place === 1 && podium.final && <Crown className="h-6 w-6" />}
            <span className="ct-podium-disc ct-display" data-metal={METAL[p.place]}>
              {p.initials}
            </span>
            <span className="w-full min-w-0 text-[0.75rem] leading-tight font-semibold [overflow-wrap:anywhere]">{p.name}</span>
            <Money value={p.net} className="text-[0.8rem]" />
          </div>
          <div className="ct-podium-step" data-metal={METAL[p.place]} aria-hidden="true">
            <span className="ct-podium-top" />
            <span className="ct-podium-front">
              <span className="ct-display">{p.place}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
