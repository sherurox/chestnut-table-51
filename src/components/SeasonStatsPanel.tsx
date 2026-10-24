import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject, type TouchEvent } from "react";
import { Link } from "react-router-dom";
import { Crown, Loading, Money, Wordmark } from "../design/components.js";
import { useCountUp } from "../design/motion.js";
import { localIsoDate } from "../domain/dates.js";
import type { Data } from "../domain/types.js";
import { formatDate, formatDollars } from "../lib/format.js";
import { offTheBooksText, statsPanelContent, type StatsPanelContent } from "../lib/statsPanel.js";

// The header wordmark's season-stats sheet. `instant` (live/end screens, reduced motion): it appears and
// disappears at once and numbers show final; otherwise it slides up and the numbers count up. Display only.

const SWIPE_CLOSE_PX = 80;
const CLOSE_FALLBACK_MS = 260;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Count({ value, format, animate }: { value: number; format: (n: number) => string; animate: boolean }) {
  const counted = useCountUp(value);
  return (
    <span className="ct-num font-semibold" aria-label={format(value)}>
      <span aria-hidden="true">{format(animate ? counted : value)}</span>
    </span>
  );
}

const plain = (n: number) => n.toLocaleString("en-US");

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ct-panel flex min-h-[64px] flex-col justify-center gap-0.5 px-3 py-2">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-lg">{children}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2.5">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      {children}
    </li>
  );
}

// The header wordmark: opens the sheet; the brand chip flips once on tap (not when `instant`).
export function WordmarkButton({ open, instant, onOpen, ref }: { open: boolean; instant: boolean; onOpen: () => void; ref: RefObject<HTMLButtonElement | null> }) {
  const [spin, setSpin] = useState(false);
  return (
    <button
      ref={ref}
      type="button"
      className="ct-wordmark-btn ct-focus flex min-h-[48px] min-w-0 items-center rounded-md"
      aria-label="Season stats"
      aria-haspopup="dialog"
      aria-expanded={open}
      data-spin={spin ? "true" : undefined}
      onClick={() => {
        setSpin(!instant);
        onOpen();
      }}
      onAnimationEnd={() => setSpin(false)}
    >
      <Wordmark size="sm" />
    </button>
  );
}

export function StatsPanelBody({ content, animate, onLeaderboard }: { content: StatsPanelContent | null; animate: boolean; onLeaderboard: () => void }) {
  if (!content) {
    return <p className="ct-display px-1 py-8 text-center text-lg font-semibold">No season running yet</p>;
  }
  const offBooks = offTheBooksText(content.incognitoGames);
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Tile label="Season games">
          <Count value={content.gamesPlayed} format={plain} animate={animate} />
        </Tile>
        <Tile label="Chips bought in">
          <Count value={content.totalBuyIns} format={formatDollars} animate={animate} />
        </Tile>
      </div>
      {offBooks && <p className="mb-3 px-1 text-sm text-ink-muted">{offBooks}</p>}

      <ul className="ct-panel ct-divided mb-3 overflow-hidden">
        {content.leader && (
          <Row label="Leader">
            <span className="flex flex-wrap items-center gap-x-2">
              <Crown className="h-4 w-4" />
              <span className="font-semibold break-words">{content.leader.name}</span>
              <Money value={content.leader.net} animate={animate} />
            </span>
            {content.leader.line && <span className="ct-line">{content.leader.line}</span>}
          </Row>
        )}
        {content.biggestNight && (
          <Row label="Biggest single night">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold break-words">{content.biggestNight.names}</span>
              <Money value={content.biggestNight.amount} animate={animate} />
              {content.biggestNight.date && <span className="text-sm text-ink-muted">{formatDate(content.biggestNight.date)}</span>}
            </span>
          </Row>
        )}
        {content.rebuyKing && (
          <Row label="Rebuy king">
            <span className="font-semibold break-words">{content.rebuyKing.names}</span>
          </Row>
        )}
        {content.winStreak && (
          <Row label="Longest win streak">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold break-words">{content.winStreak.names}</span>
              <span className="ct-num text-sm">{`${content.winStreak.length} in a row`}</span>
            </span>
          </Row>
        )}
        {!content.leader && <li className="px-3 py-3 text-sm text-ink-muted">No season games yet.</li>}
      </ul>

      {content.awards.length > 0 && (
        <section className="mb-3" aria-label="Awards so far">
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Awards so far</h3>
          <ul className="ct-panel ct-divided overflow-hidden text-sm">
            {content.awards.map((a) => (
              <li key={a.kind} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2">
                <span className="ct-display font-semibold">{a.name}</span>
                <span className="break-words">{a.holders}</span>
                <span className="ct-num text-ink-muted">{a.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link to="/" className="ct-btn ct-btn-secondary ct-focus w-full" onClick={onLeaderboard}>
        Leaderboard
      </Link>
    </>
  );
}

export function SeasonStatsPanel({
  open,
  instant,
  data,
  onClose,
  returnFocus,
}: {
  open: boolean;
  instant: boolean;
  data: Data | null;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  // Stays mounted while the close animation runs.
  const [mounted, setMounted] = useState(open);
  const sheet = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const titleId = useId();

  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;
  // Computed only while the sheet is up, and kept through the close animation.
  const content = useMemo(() => (mounted && data ? statsPanelContent(data, localIsoDate()) : null), [mounted, data]);

  useEffect(() => {
    if (!closing) return;
    if (instant) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), CLOSE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing, instant]);

  // While mounted: focus inside, Escape closes, the page behind doesn't scroll; focus goes back on unmount.
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const target = returnFocus.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      target?.focus();
    };
  }, [mounted, onClose, returnFocus]);

  if (!mounted) return null;

  const motionAttrs = { "data-state": closing ? "closing" : "open", "data-instant": instant ? "" : undefined };

  // Tab and Shift+Tab stay inside the sheet.
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !sheet.current) return;
    const items = Array.from(sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Swipe down (from the top of the sheet's scroll) to close. The sheet follows the finger.
  const onTouchStart = (e: TouchEvent) => {
    if (closing || (sheet.current?.scrollTop ?? 0) > 0) return;
    drag.current = { startY: e.touches[0]!.clientY, dy: 0 };
  };
  const onTouchMove = (e: TouchEvent) => {
    const d = drag.current;
    if (!d || !sheet.current) return;
    d.dy = Math.max(0, e.touches[0]!.clientY - d.startY);
    sheet.current.style.transition = "none";
    sheet.current.style.transform = d.dy > 0 ? `translateY(${d.dy}px)` : "";
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !sheet.current) return;
    if (d.dy > SWIPE_CLOSE_PX) {
      onClose();
      return;
    }
    sheet.current.style.transition = instant ? "none" : "transform 160ms ease-out";
    sheet.current.style.transform = "";
  };

  return (
    <>
      <div className="ct-sheet-backdrop" {...motionAttrs} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheet}
        className="ct-sheet px-4"
        {...motionAttrs}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) setMounted(false);
        }}
      >
        <span className="ct-sheet-handle" aria-hidden="true" />
        <div className="flex items-start justify-between gap-2 pt-2 pb-3">
          <div className="min-w-0 pt-2">
            <h2 id={titleId} className="ct-display text-2xl leading-tight font-semibold break-words">
              {content ? content.seasonName : "Season stats"}
            </h2>
            {content && (
              <p className="mt-1 text-sm text-ink-muted">
                Day <Count value={content.day} format={plain} animate={!instant} /> · {content.progress}
              </p>
            )}
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ct-focus grid min-h-[48px] min-w-[48px] shrink-0 place-items-center rounded-md text-2xl leading-none"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {data ? <StatsPanelBody content={content} animate={!instant} onLeaderboard={onClose} /> : <Loading />}
      </div>
    </>
  );
}
