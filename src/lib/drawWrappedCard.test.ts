import { describe, expect, it } from "vitest";
import { paintWrappedCard, STORY_WIDTH, type WrappedCardModel } from "./drawWrappedCard.js";

// A recording 2D context: text width is 0.55 × font size per character, so fitting can be checked.
function fakeContext() {
  const texts: { text: string; x: number; width: number; align: string }[] = [];
  const state = { font: "10px x", textAlign: "left" };
  const size = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 10);
  const measure = (text: string) => ({ width: Array.from(text).length * size() * 0.55 });
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText: measure,
    fillText(text: string, x: number) {
      texts.push({ text, x, width: measure(text).width, align: state.textAlign });
    },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key === "font" || key === "textAlign") return state[key];
      if (key in t) return t[key];
      return () => {};
    },
    set(t, key: string, value) {
      if (key === "font" || key === "textAlign") state[key] = value;
      else t[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

const model = (over: Partial<WrappedCardModel> = {}): WrappedCardModel => ({
  kind: "finale",
  name: "Kakahalwai",
  seasonName: "Season 1",
  place: 2,
  of: 4,
  placeLabel: "2nd of 4",
  net: 685,
  bestNight: { date: "2026-10-15", result: 475 },
  highlight: "Podium",
  ...over,
});

function paint(m: WrappedCardModel) {
  const { ctx, texts } = fakeContext();
  paintWrappedCard(ctx, m);
  return texts;
}

const left = (t: { x: number; width: number; align: string }) => (t.align === "center" ? t.x - t.width / 2 : t.x);

describe("paintWrappedCard", () => {
  it("draws the finale: brand, season, name, place, net, best night, highlight and footer", () => {
    const texts = paint(model());
    const all = texts.map((t) => t.text);
    const spaced = all.join("");
    expect(spaced).toContain("CHESTNUT TABLE 51");
    expect(spaced).toContain("SEASON WRAPPED");
    for (const text of ["Season 1", "Kakahalwai", "2nd of 4", "+$685", "+$475", "  ·  Oct 15", "Podium", "♠  Paisa he paisa hoga  ♣"]) {
      expect(all).toContain(text);
    }
  });

  it("never draws emoji", () => {
    const texts = paint(model({ highlight: "Season champion", place: 1, placeLabel: "1st of 4" }));
    for (const { text } of texts) expect(text).not.toMatch(/\p{Emoji_Presentation}/u);
  });

  it("long names and big amounts shrink to stay inside the image", () => {
    const texts = paint(
      model({
        name: "Venkataramanan Subramaniam Chattopadhyay-Banerjee",
        seasonName: "The Grand Diwali Cup Championship Season",
        net: -1_234_567,
        bestNight: { date: "2026-10-15", result: -9_876_543 },
        highlight: "Man of the Match ×5",
      }),
    );
    for (const t of texts) {
      expect(left(t)).toBeGreaterThanOrEqual(0);
      expect(left(t) + t.width).toBeLessThanOrEqual(STORY_WIDTH);
    }
    expect(texts.map((t) => t.text)).toContain("Venkataramanan Subramaniam Chattopadhyay-Banerjee");
  });

  it("no highlight, no pill", () => {
    const texts = paint(model({ highlight: "" }));
    expect(texts.some((t) => t.text === "")).toBe(false);
  });
});
