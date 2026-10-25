import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { SandboxBanner } from "../components/SandboxBanner.js";
import { ShareWrappedButton } from "../components/ShareWrapped.js";
import { WrappedSlideView } from "../components/WrappedSlides.js";
import { EmptyState, Loading, Money, PageTitle } from "../design/components.js";
import { motionReduced } from "../design/motion.js";
import { initials } from "../domain/seasonShow.js";
import { seasonById } from "../lib/selectors.js";
import { playSound } from "../lib/sound.js";
import { wrappedModel, wrappedPlayers } from "../lib/wrapped.js";
import { SLIDE_BACKGROUND, stepSlide, storyKey } from "../lib/wrappedNav.js";
import { useData } from "../state/DataContext.js";

// Season Wrapped (lazy chunk): the player picker (#/seasons/:id/wrapped) and the story
// (#/seasons/:id/wrapped/:playerId). The story covers the whole app: it is portalled to <body> (the page
// area gets a transform during screen fades, which would shift a fixed child) and always uses the dark
// palette. Tap the left third to go back, the rest to go on; arrows and Escape work too. No auto-advance.

export function WrappedPicker() {
  const { id } = useParams();
  const { data, loading } = useData();

  if (loading && !data) return <Loading />;
  const season = data && id ? seasonById(data, id) : undefined;
  const rows = data && season ? wrappedPlayers(data, season.id) : [];
  if (!data || !season || rows.length === 0) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="Wrapped not found">
          <p>Season Wrapped opens once a season is closed.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Season Wrapped" subtitle={`${season.name} · pick a player`} />
      <ul className="ct-panel overflow-hidden">
        {rows.map((r, i) => (
          <li key={r.playerId}>
            <Link to={`/seasons/${season.id}/wrapped/${r.playerId}`} className="ct-list-row ct-focus">
              <span className="ct-wrapped-disc ct-wrapped-disc-sm ct-display shrink-0" aria-hidden="true">
                {initials(r.name)}
              </span>
              <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">
                <span className="sr-only">{`${i + 1}. `}</span>
                {r.name}
              </span>
              <Money value={r.net} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WrappedStory() {
  const { id = "", playerId = "" } = useParams();
  const { data, loading } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const model = useMemo(() => (data ? wrappedModel(data, id, playerId) : null), [data, id, playerId]);
  const slides = model?.slides ?? [];
  const [index, setIndex] = useState(0);
  const [pop] = useState(() => !motionReduced());
  const dialog = useRef<HTMLDivElement>(null);
  // While the share sheet is open, Escape closes the sheet only (it has its own handler).
  const sheetOpen = useRef(false);
  const onSheet = useCallback((open: boolean) => {
    sheetOpen.current = open;
  }, []);
  const finaleShown = useRef(false);
  const at = Math.min(index, Math.max(0, slides.length - 1));
  const slide = slides[at];

  // Back to where the story was opened from; a link opened straight into it goes to the season.
  const close = useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate(`/seasons/${id}`, { replace: true });
  }, [id, location.key, navigate]);

  const move = useCallback((to: "next" | "previous") => setIndex((i) => stepSlide(i, slides.length, to)), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = storyKey(e.key);
      if (!m || sheetOpen.current) return;
      e.preventDefault();
      if (m === "close") close();
      else move(m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, move]);

  // The finale's win sound, once per story (playSound follows the Sounds setting).
  useEffect(() => {
    if (slide?.kind !== "finale" || finaleShown.current) return;
    finaleShown.current = true;
    playSound("win");
  }, [slide?.kind]);

  // The app behind can't scroll or take focus while the story is open.
  useEffect(() => {
    const html = document.documentElement;
    const root = document.getElementById("root");
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    root?.setAttribute("inert", "");
    dialog.current?.focus();
    return () => {
      html.style.overflow = overflow;
      root?.removeAttribute("inert");
    };
  }, []);

  const name = slide?.kind === "intro" ? slide.name : "";
  const body =
    loading && !data ? (
      <div className="ct-wrapped-content">
        <Loading />
      </div>
    ) : !slide ? (
      <div className="ct-wrapped-content">
        <p className="ct-display text-2xl">Wrapped not found</p>
        <p className="text-sm text-ink-muted">Season Wrapped opens once a season is closed, for players who played in it.</p>
      </div>
    ) : null;

  return createPortal(
    <div
      ref={dialog}
      className="ct-wrapped"
      data-theme="dark"
      data-bg={slide ? SLIDE_BACKGROUND[slide.kind] : "velvet"}
      role="dialog"
      aria-modal="true"
      aria-label={name ? `${name}'s Season Wrapped` : "Season Wrapped"}
      tabIndex={-1}
    >
      <SandboxBanner />
      <div className="ct-wrapped-bar">
        <ol className="ct-wrapped-progress" aria-hidden="true">
          {slides.map((s, i) => (
            <li key={s.kind} data-done={i <= at ? "" : undefined} />
          ))}
        </ol>
        <button type="button" className="ct-wrapped-close ct-focus" aria-label="Close" onClick={close}>
          ✕
        </button>
      </div>
      <div className="ct-wrapped-stage">
        {slide && (
          <div className="ct-wrapped-zones">
            <button type="button" className="ct-wrapped-zone w-1/3" aria-label="Previous" aria-disabled={at === 0} onClick={() => move("previous")} />
            <button type="button" className="ct-wrapped-zone w-2/3" aria-label="Next" aria-disabled={at === slides.length - 1} onClick={() => move("next")} />
          </div>
        )}
        <div className="ct-wrapped-live" aria-live="polite">
          {slide && <span className="sr-only">{`Slide ${at + 1} of ${slides.length}.`}</span>}
          {body ?? (
            <div key={at} className={`ct-wrapped-content ${pop ? "ct-wrapped-pop" : ""}`}>
              {slide && <WrappedSlideView slide={slide} />}
              {slide?.kind === "finale" && <ShareWrappedButton model={slide} onSheet={onSheet} />}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
