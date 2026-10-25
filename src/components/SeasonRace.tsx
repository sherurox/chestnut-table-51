import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Money } from "../design/components.js";
import { useMotionReduced } from "../design/motion.js";
import { formatSignedDollars } from "../lib/format.js";
import type { RaceFrame } from "../lib/seasonShow.js";

// "The race" on a season's page: the standings after each game as diverging bars, with a replay.
// Opens on the last frame (the current standings). Animation is visual only: every frame shows exact values,
// and with motion off there is no autoplay or transition, just the step buttons.

const STEP_MS = 1100;
const ROW_FALLBACK = 56;

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function SeasonRace({ frames }: { frames: RaceFrame[] }) {
  const reduced = useMotionReduced();
  const last = frames.length - 1;
  const [picked, setPicked] = useState<number | null>(null); // null = the last frame, even after a refresh adds a game
  const [playing, setPlaying] = useState(false);
  const index = picked === null ? last : Math.min(picked, last);
  const frame = frames[index]!;

  // Autoplay: one step every STEP_MS, stopping on the last frame. Cleared on pause, unmount and motion off.
  useEffect(() => {
    if (!playing || reduced) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setPicked(index + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, reduced, index, last]);

  const step = (to: number) => {
    setPlaying(false);
    setPicked(Math.max(0, Math.min(to, last)));
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (index >= last) setPicked(0);
    setPlaying(true);
  };

  // The largest |net| in any frame is half the track, so no bar ever overflows.
  const scale = useMemo(() => Math.max(0, ...frames.flatMap((f) => f.rows.map((r) => Math.abs(r.net)))), [frames]);

  // Rows keep a stable DOM order (moving nodes would cancel their transitions); each one's top comes from
  // the measured heights of the rows ranked above it, so a wrapped name never overlaps the next row.
  const order = useMemo(() => {
    const ids: string[] = [];
    for (const f of frames) for (const r of f.rows) if (!ids.includes(r.playerId)) ids.push(r.playerId);
    return ids;
  }, [frames]);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const next: Record<string, number> = {};
      refs.current.forEach((el, id) => (next[id] = el.offsetHeight));
      setHeights((prev) => (Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[k] === next[k]) ? prev : next));
    };
    measure();
    // Re-measure when a row's height changes (a rotate, or the fonts arriving after the first layout).
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    refs.current.forEach((el) => observer?.observe(el));
    return () => observer?.disconnect();
  }, [frame]);

  // Transitions switch on only after the first measured layout, so rows don't slide in on open.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMeasured(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const tops = new Map<string, number>();
  let height = 0;
  for (const row of frame.rows) {
    tops.set(row.playerId, height);
    height += heights[row.playerId] ?? ROW_FALLBACK;
  }
  const rowsById = new Map(frame.rows.map((r) => [r.playerId, r]));

  return (
    <div className="ct-panel p-3">
      <div className="ct-race-caption mb-3 rounded-xl p-3" aria-live="polite">
        <p className="ct-eyebrow text-[0.7rem] text-ink-muted">
          After game {frame.gameNumber} of {frames.length} · {frame.date}
        </p>
        <p className="mt-1 text-sm font-semibold break-words">{frame.caption}</p>
      </div>

      <ol className="sr-only">
        {frame.rows.map((r) => (
          <li key={r.playerId}>{`${r.rank}, ${r.name}, ${formatSignedDollars(r.net)}`}</li>
        ))}
      </ol>

      <div
        className={`ct-race ${measured && !reduced ? "ct-race-anim" : ""}`}
        style={{ height }}
        aria-hidden="true"
      >
        {order.map((id) => {
          const row = rowsById.get(id);
          if (!row) return null;
          const width = scale === 0 ? 0 : (Math.abs(row.net) / scale) * 50;
          const tone = row.rank === 1 ? "lead" : row.net < 0 ? "down" : "up";
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) refs.current.set(id, el);
                else refs.current.delete(id);
              }}
              className="ct-race-row"
              style={{ top: tops.get(id) ?? 0 }}
            >
              <div className="flex items-baseline gap-2">
                <span className="ct-display ct-num w-6 shrink-0 text-right text-sm text-ink-muted">{row.rank}</span>
                <span className="min-w-0 flex-1 text-sm font-medium break-words">{row.name}</span>
                <Money value={row.net} className="shrink-0 text-sm" />
              </div>
              <div className="ct-race-track mt-1.5 ml-8">
                <span
                  className="ct-race-bar"
                  data-tone={tone}
                  style={{ left: `${row.net < 0 ? 50 - width : 50}%`, width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <button
          type="button"
          className="ct-btn ct-btn-secondary ct-focus min-h-12 w-14 shrink-0"
          onClick={() => step(index - 1)}
          disabled={index === 0}
          aria-label="Previous game"
        >
          <Icon path="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" />
        </button>
        {reduced ? (
          <span className="flex-1" />
        ) : (
          <button type="button" className="ct-btn ct-btn-primary ct-focus min-h-12 flex-1" onClick={togglePlay} aria-label={playing ? "Pause the race" : "Play the race from game 1"}>
            <span className="inline-flex items-center gap-2">
              <Icon path={playing ? "M7 5h4v14H7zm6 0h4v14h-4z" : "M8 5v14l11-7z"} />
              {playing ? "Pause" : "Play"}
            </span>
          </button>
        )}
        <button
          type="button"
          className="ct-btn ct-btn-secondary ct-focus min-h-12 w-14 shrink-0"
          onClick={() => step(index + 1)}
          disabled={index === last}
          aria-label="Next game"
        >
          <Icon path="M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z" />
        </button>
      </div>
    </div>
  );
}
