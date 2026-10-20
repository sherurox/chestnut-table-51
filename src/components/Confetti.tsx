import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CONFETTI_MS, confettiParticles } from "../lib/celebrations.js";

// A short brass-and-chip confetti burst over its (position: relative) parent. CSS transform/opacity only,
// never takes taps, and removes itself from the page when done. Callers render it only when
// animationsAllowed() said yes.
export function Confetti({ onDone }: { onDone: () => void }) {
  const particles = useMemo(() => confettiParticles(), []);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      onDone();
    }, CONFETTI_MS + 50);
    return () => clearTimeout(timer);
  }, [onDone]);
  if (done) return null;
  return (
    <span className="ct-confetti" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="ct-confetti-bit"
          style={
            {
              left: `${p.x}%`,
              width: p.w,
              height: p.h,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
