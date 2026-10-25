import { calendarDate } from "./format.js";
import type { WrappedSlideKind } from "./wrapped.js";

// The Wrapped story's controls and look, kept pure: which way a key goes, where a step lands, and each
// slide's background. No auto-advance: the story only moves when tapped or keyed.

export type StoryMove = "next" | "previous" | "close";

export function storyKey(key: string): StoryMove | null {
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "previous";
  if (key === "Escape") return "close";
  return null;
}

// One step, never past either end (the finale's Next does nothing).
export function stepSlide(index: number, count: number, move: "next" | "previous"): number {
  return Math.max(0, Math.min(count - 1, index + (move === "next" ? 1 : -1)));
}

export type WrappedBackground = "velvet" | "felt" | "brass" | "midnight" | "oxblood";

// By kind, so the colours follow the story: two slides next to each other never share one, whichever
// optional slides (tough night, nemesis) are left out.
export const SLIDE_BACKGROUND: Record<WrappedSlideKind, WrappedBackground> = {
  intro: "velvet",
  finish: "brass",
  bestNight: "felt",
  top: "midnight",
  toughNight: "oxblood",
  nemesis: "felt",
  badges: "brass",
  finale: "velvet",
};

// "2026-10-19" → "Oct 19" (local calendar day).
export function shortDate(isoDate: string): string {
  const d = calendarDate(isoDate);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : isoDate;
}

// "Oct 15 – Oct 26"; one date when the season started and ended the same day.
export function dateRange(from: string, to: string): string {
  return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
}
