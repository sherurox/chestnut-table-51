import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { PageTitle, PlayingCard, SuitHeading } from "../design/components.js";
import { BASICS, GUIDE_TABS, HAND_RANKS, readGuideTab, saveGuideTab, TIES, type GuideSection, type GuideTab } from "../lib/pokerGuide.js";
import { browserStore } from "../storage/localKeys.js";

const SUITS = ["♠", "♥", "♦", "♣"] as const;

export function PokerGuide() {
  const [tab, setTab] = useState<GuideTab>(() => readGuideTab(browserStore()));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const select = (next: GuideTab) => {
    setTab(next);
    saveGuideTab(browserStore(), next);
  };

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = GUIDE_TABS.length - 1;
    const to =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    select(GUIDE_TABS[to]!.id);
    tabRefs.current[to]?.focus();
  };

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♠" title="Poker Guide" subtitle="Texas Hold'em" />
      <div role="tablist" aria-label="Poker Guide" className="ct-tabs mb-4">
        {GUIDE_TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="ct-tab ct-focus"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} className="ct-rise">
        {tab === "ranks" ? <HandRanks /> : <Sections sections={tab === "ties" ? TIES : BASICS} />}
      </div>
    </div>
  );
}

function HandRanks() {
  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">Hand ranks, best to worst. Dimmed cards are kickers: they aren't part of the hand and only count to break a tie.</p>
      <ol className="flex flex-col gap-3">
        {HAND_RANKS.map((hand, i) => (
          <li key={hand.type} className="ct-panel p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="ct-rank ct-rank-brass" aria-hidden="true">
                {i + 1}
              </span>
              <h2 className="ct-display text-lg font-semibold leading-tight">{hand.name}</h2>
            </div>
            <div className="ct-hand" role="group" aria-label={`Example ${hand.name.toLowerCase()}`}>
              {hand.cards.map((card) => (
                <PlayingCard key={`${card.rank}${card.suit}`} card={card} />
              ))}
            </div>
            <p className="mt-3">{keepRuns(hand.description)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              <span className="font-semibold text-brass">If tied:</span> {keepRuns(hand.ifTied)}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

// Card runs like "A-2-3-4-5" or "8-8-8-2-2" never break at a hyphen.
const RUN = /((?:\b[2-9AJQK]|10)(?:-(?:[2-9AJQK]|10)\b)+)/;

function keepRuns(text: string): ReactNode {
  return text.split(RUN).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// "Check: pass without betting…" → the term before the colon is bold.
const TERM = /^([^:.]{1,32}): (.*)$/;

function Sections({ sections }: { sections: GuideSection[] }) {
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, i) => (
        <section key={section.title} className="ct-panel p-4">
          <div className="mb-2 text-lg">
            <SuitHeading suit={SUITS[i % SUITS.length]}>{section.title}</SuitHeading>
          </div>
          <div className="flex flex-col gap-2">
            {section.paragraphs.map((text) => {
              const term = TERM.exec(text);
              return (
                <p key={text}>
                  {term ? (
                    <>
                      <span className="font-semibold">{term[1]}:</span> {keepRuns(term[2]!)}
                    </>
                  ) : (
                    keepRuns(text)
                  )}
                </p>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
