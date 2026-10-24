import { describe, expect, it } from "vitest";
import {
  BASICS,
  cardLabel,
  GUIDE_TAB_KEY,
  HAND_RANKS,
  readGuideTab,
  saveGuideTab,
  TIES,
  type GuideCard,
  type HandType,
} from "./pokerGuide.js";

// A small 5-card evaluator, only for checking the guide's examples: the hand type, and which cards make
// the hand (the rest are kickers).
function classify(cards: GuideCard[]): { type: HandType; core: Set<number> } {
  const all = new Set(cards.map((_, i) => i));
  const byRank = new Map<number, number[]>();
  cards.forEach((card, i) => byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), i]));
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length);
  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  const flush = cards.every((card) => card.suit === cards[0]!.suit);
  const distinct = byRank.size === 5;
  const wheel = ranks.join() === "2,3,4,5,14";
  const straight = distinct && (ranks[4]! - ranks[0]! === 4 || wheel);
  const indexes = (...gs: number[][]) => new Set(gs.flat());

  if (straight && flush) return { type: ranks[0] === 10 ? "royalFlush" : "straightFlush", core: all };
  if (groups[0]!.length === 4) return { type: "fourOfAKind", core: indexes(groups[0]!) };
  if (groups[0]!.length === 3 && groups[1]!.length === 2) return { type: "fullHouse", core: all };
  if (flush) return { type: "flush", core: all };
  if (straight) return { type: "straight", core: all };
  if (groups[0]!.length === 3) return { type: "threeOfAKind", core: indexes(groups[0]!) };
  if (groups[0]!.length === 2 && groups[1]!.length === 2) return { type: "twoPair", core: indexes(groups[0]!, groups[1]!) };
  if (groups[0]!.length === 2) return { type: "onePair", core: indexes(groups[0]!) };
  const high = cards.findIndex((card) => card.rank === ranks[4]);
  return { type: "highCard", core: new Set([high]) };
}

describe("hand ranks", () => {
  it("lists all 10 hands, best to worst", () => {
    expect(HAND_RANKS.map((h) => h.name)).toEqual([
      "Royal flush",
      "Straight flush",
      "Four of a kind",
      "Full house",
      "Flush",
      "Straight",
      "Three of a kind",
      "Two pair",
      "One pair",
      "High card",
    ]);
  });

  it.each(HAND_RANKS.map((h) => [h.name, h] as const))("%s: the example is 5 distinct valid cards", (_, hand) => {
    expect(hand.cards).toHaveLength(5);
    expect(new Set(hand.cards.map((card) => `${card.rank}${card.suit}`)).size).toBe(5);
    for (const card of hand.cards) {
      expect(Number.isInteger(card.rank) && card.rank >= 2 && card.rank <= 14).toBe(true);
      expect(["s", "h", "d", "c"]).toContain(card.suit);
    }
  });

  it.each(HAND_RANKS.map((h) => [h.name, h] as const))("%s: the example is that hand, kickers marked", (_, hand) => {
    const { type, core } = classify(hand.cards);
    expect(type).toBe(hand.type);
    expect(hand.cards.map((card) => card.kicker === true)).toEqual(hand.cards.map((_, i) => !core.has(i)));
  });

  it("every hand has a description and an If tied line", () => {
    for (const hand of HAND_RANKS) {
      expect(hand.description.length).toBeGreaterThan(0);
      expect(hand.ifTied.length).toBeGreaterThan(0);
    }
  });

  it("the evaluator itself tells close hands apart", () => {
    const wheel: GuideCard[] = [
      { rank: 14, suit: "s" },
      { rank: 2, suit: "h" },
      { rank: 3, suit: "d" },
      { rank: 4, suit: "c" },
      { rank: 5, suit: "s" },
    ];
    expect(classify(wheel).type).toBe("straight");
    const wrap = wheel.map((card) => (card.rank === 5 ? { ...card, rank: 13 as const } : card));
    expect(classify(wrap).type).toBe("highCard"); // K-A-2-3-4 doesn't wrap around
    const steelWheel = wheel.map((card) => ({ ...card, suit: "h" as const }));
    expect(classify(steelWheel).type).toBe("straightFlush");
  });
});

describe("card labels", () => {
  it("names the card, and says kicker when it is one", () => {
    expect(cardLabel({ rank: 12, suit: "s" })).toBe("Queen of spades");
    expect(cardLabel({ rank: 10, suit: "h" })).toBe("Ten of hearts");
    expect(cardLabel({ rank: 4, suit: "s", kicker: true })).toBe("Four of spades, kicker");
  });
});

describe("ties and basics text", () => {
  const text = (sections: typeof TIES) => sections.flatMap((s) => [s.title, ...s.paragraphs]).join(" ");

  it("covers the tie rules", () => {
    const ties = text(TIES);
    for (const phrase of ["Suits never break ties", "Best five of seven", "Kickers", "A-2-3-4-5", "Playing the board", "odd chip"]) {
      expect(ties).toContain(phrase);
    }
  });

  it("covers the basics", () => {
    const basics = text(BASICS);
    for (const phrase of ["small blind", "big blind", "Pre-flop", "Flop", "Turn", "River", "Check", "Bet", "Call", "Raise", "Fold", "All-in", "showdown", "side pot"]) {
      expect(basics).toContain(phrase);
    }
  });
});

describe("remembered tab", () => {
  const store = (value: string | null) => ({ getItem: (key: string) => (key === GUIDE_TAB_KEY ? value : null) });

  it("defaults to Hands", () => {
    expect(readGuideTab(null)).toBe("ranks");
    expect(readGuideTab(store(null))).toBe("ranks");
    expect(readGuideTab(store("nonsense"))).toBe("ranks");
  });

  it("reads a saved tab", () => {
    expect(readGuideTab(store("ties"))).toBe("ties");
    expect(readGuideTab(store("basics"))).toBe("basics");
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      },
    };
    expect(readGuideTab(blocked)).toBe("ranks");
    expect(() => saveGuideTab(blocked, "ties")).not.toThrow();
  });

  it("saves under ct51.guideTab", () => {
    const saved = new Map<string, string>();
    saveGuideTab({ setItem: (k, v) => void saved.set(k, v) }, "basics");
    expect(saved.get("ct51.guideTab")).toBe("basics");
  });
});
