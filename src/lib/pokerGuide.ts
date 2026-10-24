import type { KeyValueStore } from "../storage/localKeys.js";

// Poker Guide content (#/guide): Texas Hold'em hand ranks, ties and basics. Static text only, no data.

export type Suit = "s" | "h" | "d" | "c";
export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11 = J … 14 = A

export interface GuideCard {
  rank: CardRank;
  suit: Suit;
  kicker?: boolean; // not part of the made hand: shown dimmed
}

export type HandType =
  | "royalFlush"
  | "straightFlush"
  | "fourOfAKind"
  | "fullHouse"
  | "flush"
  | "straight"
  | "threeOfAKind"
  | "twoPair"
  | "onePair"
  | "highCard";

export interface HandRankInfo {
  type: HandType;
  name: string;
  cards: GuideCard[]; // always 5
  description: string;
  ifTied: string;
}

const c = (rank: CardRank, suit: Suit, kicker = false): GuideCard => (kicker ? { rank, suit, kicker } : { rank, suit });

// Best to worst. Position + 1 is the rank number shown.
export const HAND_RANKS: HandRankInfo[] = [
  {
    type: "royalFlush",
    name: "Royal flush",
    cards: [c(14, "s"), c(13, "s"), c(12, "s"), c(11, "s"), c(10, "s")],
    description: "A, K, Q, J and 10, all the same suit. The best hand there is.",
    ifTied: "Only possible when it's all on the board: everyone left splits the pot.",
  },
  {
    type: "straightFlush",
    name: "Straight flush",
    cards: [c(9, "h"), c(8, "h"), c(7, "h"), c(6, "h"), c(5, "h")],
    description: "Five cards in a row, all the same suit.",
    ifTied: "The higher top card wins; the same top card splits. A-2-3-4-5 is the lowest.",
  },
  {
    type: "fourOfAKind",
    name: "Four of a kind",
    cards: [c(12, "s"), c(12, "h"), c(12, "d"), c(12, "c"), c(4, "s", true)],
    description: "Four cards of the same rank.",
    ifTied: "The higher four wins. Same four (on the board): the higher kicker wins.",
  },
  {
    type: "fullHouse",
    name: "Full house",
    cards: [c(13, "s"), c(13, "h"), c(13, "d"), c(7, "c"), c(7, "h")],
    description: "Three of one rank plus a pair of another.",
    ifTied: "The higher three wins, then the higher pair.",
  },
  {
    type: "flush",
    name: "Flush",
    cards: [c(14, "d"), c(11, "d"), c(8, "d"), c(6, "d"), c(2, "d")],
    description: "Any five cards of the same suit, not in a row.",
    ifTied: "Compare the highest card, then the next, down to all five.",
  },
  {
    type: "straight",
    name: "Straight",
    cards: [c(10, "c"), c(9, "d"), c(8, "h"), c(7, "s"), c(6, "c")],
    description: "Five cards in a row, any suits. The ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).",
    ifTied: "The higher top card wins; the same top card splits. A-2-3-4-5 is the lowest.",
  },
  {
    type: "threeOfAKind",
    name: "Three of a kind",
    cards: [c(8, "s"), c(8, "h"), c(8, "d"), c(13, "c", true), c(3, "h", true)],
    description: "Three cards of the same rank.",
    ifTied: "The higher three wins, then the two kickers, highest first.",
  },
  {
    type: "twoPair",
    name: "Two pair",
    cards: [c(11, "h"), c(11, "c"), c(5, "s"), c(5, "d"), c(14, "h", true)],
    description: "Two pairs of different ranks.",
    ifTied: "The higher pair wins, then the lower pair, then the kicker.",
  },
  {
    type: "onePair",
    name: "One pair",
    cards: [c(10, "s"), c(10, "h"), c(14, "c", true), c(7, "d", true), c(4, "s", true)],
    description: "Two cards of the same rank.",
    ifTied: "The higher pair wins, then the three kickers, highest first.",
  },
  {
    type: "highCard",
    name: "High card",
    cards: [c(14, "h"), c(12, "c", true), c(9, "s", true), c(6, "d", true), c(3, "c", true)],
    description: "Nothing better: your highest card plays.",
    ifTied: "Compare the highest card, then the next, down to all five.",
  },
];

const RANK_NAMES: Record<CardRank, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};
const RANK_SHORT: Record<CardRank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};
const SUIT_NAMES: Record<Suit, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
// U+FE0E asks for the text glyph, so iOS doesn't draw ♥ and ♦ as emoji.
const SUIT_SYMBOLS: Record<Suit, string> = { s: "♠︎", h: "♥︎", d: "♦︎", c: "♣︎" };

export const cardRankText = (rank: CardRank): string => RANK_SHORT[rank];
export const suitSymbol = (suit: Suit): string => SUIT_SYMBOLS[suit];
export const isRedSuit = (suit: Suit): boolean => suit === "h" || suit === "d";

// "Queen of spades", "Four of spades, kicker".
export function cardLabel(card: GuideCard): string {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}${card.kicker ? ", kicker" : ""}`;
}

export interface GuideSection {
  title: string;
  paragraphs: string[];
}

export const TIES: GuideSection[] = [
  {
    title: "Suits never break ties",
    paragraphs: ["No suit beats another. A flush in spades and a flush in hearts with the same cards are equal."],
  },
  {
    title: "Best five of seven",
    paragraphs: [
      "You have 2 hole cards and there are 5 on the board. Your hand is the best 5 you can make from those 7. The other 2 don't count, not even to break a tie.",
    ],
  },
  {
    title: "Kickers",
    paragraphs: [
      "A kicker is a card in your best five that isn't part of the pair, trips or quads. It only matters when two hands are otherwise equal.",
      "Example: you hold A-K, they hold A-9, the board is A-8-6-4-2. Both have a pair of aces; your king kicker beats their 9.",
    ],
  },
  {
    title: "How each hand breaks a tie",
    paragraphs: [
      "Straight and straight flush: the higher top card wins. A-2-3-4-5 is the lowest straight (the ace plays low); Q-K-A-2-3 is not a straight.",
      "Four of a kind: the higher four, then the kicker.",
      "Full house: compare the three first, then the pair. 8-8-8-2-2 beats 7-7-7-A-A.",
      "Flush: compare all five cards, highest first, until one is higher.",
      "Three of a kind: the three, then both kickers.",
      "Two pair: the higher pair, then the lower pair, then the kicker.",
      "One pair: the pair, then the three kickers in order.",
      "High card: all five cards, highest first.",
    ],
  },
  {
    title: "Playing the board",
    paragraphs: [
      "When the best five cards are all on the board, everyone still in plays the same hand and the pot is split. Example: the board is 5-6-7-8-9 in mixed suits and nobody has a 10: every remaining player has a 9-high straight.",
    ],
  },
  {
    title: "Split pots and the odd chip",
    paragraphs: [
      "Hands that are exactly equal split the pot evenly. If it can't split evenly, the odd chip goes to the winner closest to the left of the button.",
    ],
  },
];

export const BASICS: GuideSection[] = [
  {
    title: "The button and the blinds",
    paragraphs: [
      "The button marks the dealer and moves one seat to the left every hand. The player on its left posts the small blind, the next player the big blind: forced bets so there's always something to win.",
      "Heads-up (two players): the button posts the small blind and acts first before the flop.",
    ],
  },
  {
    title: "Four betting rounds",
    paragraphs: [
      "Pre-flop: everyone gets 2 hole cards. Betting starts left of the big blind.",
      "Flop: 3 cards are dealt face up on the board. Betting starts with the first player still in, left of the button.",
      "Turn: a 4th board card, then a round of betting.",
      "River: the 5th and last board card, then the final round.",
    ],
  },
  {
    title: "Your options",
    paragraphs: [
      "Check: pass without betting (only when there's nothing to call).",
      "Bet: put chips in when nobody has bet yet.",
      "Call: match the current bet.",
      "Raise: bet more than the current bet, by at least the size of the last bet or raise. Everyone else must call the new amount, raise again or fold.",
      "Fold: give up the hand and any chips you've put in.",
      "All-in: bet every chip you have left.",
    ],
  },
  {
    title: "The showdown",
    paragraphs: [
      "If two or more players are left after the river betting, they show their cards. The last player to bet or raise on the river shows first (if nobody bet, the first player left of the button). The best five-card hand wins the pot.",
    ],
  },
  {
    title: "Using your hole cards",
    paragraphs: [
      "Your five can use both hole cards, one, or none (playing the board). Any mix of your 2 and the board's 5 is allowed.",
    ],
  },
  {
    title: "Side pots",
    paragraphs: [
      "An all-in player can only win as much from each opponent as they put in themselves. Bets beyond that go into a side pot that only the players who paid into it can win.",
    ],
  },
];

// The selected tab, remembered per device.
export const GUIDE_TAB_KEY = "ct51.guideTab";
export const GUIDE_TABS = [
  { id: "ranks", label: "Hands" },
  { id: "ties", label: "Ties" },
  { id: "basics", label: "Basics" },
] as const;
export type GuideTab = (typeof GUIDE_TABS)[number]["id"];

export function readGuideTab(store: Pick<KeyValueStore, "getItem"> | null): GuideTab {
  try {
    const stored = store?.getItem(GUIDE_TAB_KEY);
    return GUIDE_TABS.find((t) => t.id === stored)?.id ?? "ranks";
  } catch {
    return "ranks"; // storage blocked
  }
}

export function saveGuideTab(store: Pick<KeyValueStore, "setItem"> | null, tab: GuideTab): void {
  try {
    store?.setItem(GUIDE_TAB_KEY, tab);
  } catch {
    // storage unavailable: the tab just isn't remembered
  }
}
