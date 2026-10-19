import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AppIconSvg, ChipBadge, Crown, Money, RankBadge, Splash, SuitHeading, Wordmark } from "../design/components.js";
import { chipFeedback, useFlip, useReducedMotion } from "../design/motion.js";
import { formatDollars, formatSignedDollars } from "../lib/format.js";

// DEV ONLY (#/style): a living style guide for the Phase 4.5 redesign. App.tsx only registers this route
// when import.meta.env.DEV, and check-bundle fails if the marker below ever reaches dist/.
const MARKER = "ct51-style-preview";

// ---- contrast (WCAG 2.x) ------------------------------------------------------------------------

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const PALETTE = {
  dark: [
    ["Felt (page)", "#0b1d16"],
    ["Felt (panel)", "#123326"],
    ["Hairline", "#2c5a46"],
    ["Mahogany", "#2b150d"],
    ["Wood", "#5b2c19"],
    ["Chestnut", "#8a4a2c"],
    ["Brass", "#d6b35e"],
    ["Brass light", "#f0d68b"],
    ["Ivory text", "#f4ecda"],
    ["Muted text", "#c4bba6"],
    ["Win", "#6fdc9a"],
    ["Loss", "#ff9076"],
  ],
  light: [
    ["Ivory (page)", "#f4ecda"],
    ["Card", "#fffaf0"],
    ["Hairline", "#d9caa8"],
    ["Wood", "#6b3420"],
    ["Brass", "#b8923e"],
    ["Brass deep", "#7d5f1f"],
    ["Ink text", "#1f2a22"],
    ["Muted text", "#5a5240"],
    ["Win", "#17703f"],
    ["Loss", "#b0381f"],
  ],
} as const;

const CONTRAST_PAIRS: Record<"dark" | "light", [string, string, string][]> = {
  dark: [
    ["Ivory on felt", "#f4ecda", "#0b1d16"],
    ["Muted on panel", "#c4bba6", "#123326"],
    ["Win on panel", "#6fdc9a", "#123326"],
    ["Loss on panel", "#ff9076", "#123326"],
    ["Brass on panel", "#d6b35e", "#123326"],
    ["Ink on brass button", "#2a1a08", "#d6b35e"],
    ["Ivory on rail wood", "#f4ecda", "#5b2c19"],
    ["Chip label: red", "#fff8ea", "#a8322a"],
    ["Chip label: blue", "#fff8ea", "#1f4f8c"],
    ["Chip label: black", "#fff8ea", "#1c1a17"],
    ["Rank 1 text on gold", "#24170a", "#e1b84a"],
  ],
  light: [
    ["Ink on ivory", "#1f2a22", "#f4ecda"],
    ["Muted on card", "#5a5240", "#fffaf0"],
    ["Win on card", "#17703f", "#fffaf0"],
    ["Loss on card", "#b0381f", "#fffaf0"],
    ["Brass deep on card", "#7d5f1f", "#fffaf0"],
    ["Ink on brass button", "#2a1a08", "#b8923e"],
  ],
};

// ---- sample data ---------------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  net: number;
  games: number;
  last: number;
}

const START: Row[] = [
  { id: "s", name: "Shreyas", net: 3450, games: 9, last: 1100 },
  { id: "r", name: "Rohan", net: 1200, games: 10, last: -100 },
  { id: "a", name: "Amit", net: 300, games: 8, last: -1000 },
  { id: "p", name: "Priya", net: 0, games: 3, last: 0 },
  { id: "d", name: "Dev", net: -1950, games: 9, last: 650 },
  { id: "k", name: "Kiran", net: -3000, games: 7, last: -650 },
];

const sortRows = (rows: Row[]) =>
  [...rows].sort((a, b) => b.net - a.net || b.games - a.games || a.name.localeCompare(b.name));

// A fake zero-sum game night, to show count-up and rank slides.
function playNight(rows: Row[]): Row[] {
  const players = [...rows].sort(() => Math.random() - 0.5).slice(0, 4);
  const results = [1500, 500, -700, -1300].sort(() => Math.random() - 0.5);
  return rows.map((r) => {
    const i = players.findIndex((p) => p.id === r.id);
    if (i < 0) return r;
    const res = results[i]!;
    return { ...r, net: r.net + res, games: r.games + 1, last: res };
  });
}

// ---- layout bits ---------------------------------------------------------------------------------

function Section({ title, suit, children }: { title: string; suit: "♠" | "♥" | "♦" | "♣"; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 text-xl">
        <SuitHeading suit={suit}>{title}</SuitHeading>
      </div>
      {children}
    </section>
  );
}

function Leaderboard({ rows, me, animate }: { rows: Row[]; me: string; animate: boolean }) {
  const sorted = useMemo(() => sortRows(rows), [rows]);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, [sorted.map((r) => r.id).join(",")]);
  return (
    <div className="ct-panel overflow-hidden">
      <div className="flex items-baseline justify-between px-3 pt-3 pb-2">
        <span className="ct-display text-lg font-semibold">Season 2</span>
        <span className="ct-muted text-xs">6 players · 14 games</span>
      </div>
      <ol ref={list}>
        {sorted.map((r, i) => (
          <li
            key={r.id}
            data-flip={r.id}
            className={`ct-row ${animate ? "ct-rise" : ""} ${r.id === me ? "ct-row-me" : ""}`}
            style={{ "--i": i } as CSSProperties}
          >
            <RankBadge rank={i + 1} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {r.name}
                {r.id === me && <span className="ct-brass ml-1.5 text-xs font-semibold">YOU</span>}
              </span>
              <span className="ct-muted block text-xs">
                {r.games} games · last <span className="ct-num">{formatSignedDollars(r.last)}</span>
              </span>
            </span>
            <Money value={r.net} animate className="text-lg" />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LiveCard() {
  const presets: [number, string][] = [
    [1000, "red"],
    [1500, "blue"],
    [2000, "black"],
  ];
  const [buyIns, setBuyIns] = useState<number[]>([1000, 1500]);
  const total = buyIns.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="ct-display text-xl font-semibold">Live game</div>
          <div className="ct-muted text-sm">Fri 24 Oct · Season 2</div>
        </div>
        <div className="text-right">
          <div className="ct-muted text-xs tracking-wide uppercase">Table total</div>
          <div className="ct-num ct-brass text-3xl font-bold">{formatDollars(total + 3000)}</div>
        </div>
      </div>
      <div className="ct-panel p-3">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-lg font-semibold">Shreyas</span>
          <span className="text-right">
            <span className="ct-num block text-xl font-bold">{formatDollars(total)}</span>
            <span className="ct-muted block text-xs">
              {buyIns.length} buy-in{buyIns.length === 1 ? "" : "s"}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-4 justify-items-center gap-2">
          {presets.map(([amount, tone]) => (
            <button
              key={amount}
              type="button"
              className="ct-chip"
              data-tone={tone}
              aria-label={`Buy in ${formatDollars(amount)} for Shreyas`}
              onClick={(e) => {
                setBuyIns((b) => [...b, amount]); // record first…
                chipFeedback(e.currentTarget); // …then decorate
              }}
            >
              {formatDollars(amount)}
            </button>
          ))}
          <button type="button" className="ct-chip" data-tone="outline">
            Custom
          </button>
        </div>
      </div>
      <UndoBar label={buyIns.length ? `Undo: Shreyas +${formatDollars(buyIns[buyIns.length - 1]!)}` : null} onUndo={() => setBuyIns((b) => b.slice(0, -1))} />
      <p className="ct-muted mt-4 mb-2 text-xs">A long name wraps to two lines instead of being cut off:</p>
      <UndoBar label="Undo: Christopher-Alexander +$10,000" onUndo={() => {}} />
    </>
  );
}

// Live-screen action bar. The Undo label always names the whole target ("Undo: Shreyas +$1,500"):
// "End game" takes only the width it needs, Undo gets the rest and wraps rather than truncating.
function UndoBar({ label, onUndo }: { label: string | null; onUndo: () => void }) {
  return (
    <div className="mt-3 flex items-stretch gap-2">
      <button type="button" className="ct-btn ct-btn-secondary flex-1 text-[15px]" disabled={!label} onClick={onUndo}>
        {label ?? "Nothing to undo"}
      </button>
      <button type="button" className="ct-btn ct-btn-primary shrink-0 px-4 whitespace-nowrap">
        End game
      </button>
    </div>
  );
}

function ChipCheck({ pass }: { pass: boolean }) {
  return (
    <div className={`ct-panel ${pass ? "" : "ct-panel-brass"} p-4`}>
      <div className="mb-2 text-lg">
        <SuitHeading suit="♦" as="h3">
          Chip check
        </SuitHeading>
      </div>
      <div className="ct-muted mb-1 text-sm">
        Buy-ins <span className="ct-num">{formatDollars(5500)}</span> · Stacks{" "}
        <span className="ct-num">{formatDollars(pass ? 5500 : 4000)}</span>
      </div>
      {pass ? (
        <p className="ct-win text-2xl font-bold">✓ Stacks match</p>
      ) : (
        <>
          <p className="ct-loss ct-num text-2xl font-bold">Short by $1,500</p>
          <p className="mt-1 font-medium">Same as one $1,500 buy-in — missed rebuy?</p>
          <button type="button" className="ct-btn ct-btn-secondary mt-3">
            Fix buy-ins
          </button>
        </>
      )}
      <button type="button" className="ct-btn ct-btn-primary mt-3 w-full" disabled={!pass}>
        {pass ? "Save game" : "Save game (chip check must pass)"}
      </button>
    </div>
  );
}

// ---- page ----------------------------------------------------------------------------------------

export function StylePreview() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [rows, setRows] = useState(START);
  const [staggerKey, setStaggerKey] = useState(0);
  const [splash, setSplash] = useState(false);
  const [screen, setScreen] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const before = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      if (before) document.documentElement.setAttribute("data-theme", before);
    };
  }, [theme]);

  const endSplash = useCallback(() => setSplash(false), []);

  return (
    <div className="ct-app" data-marker={MARKER}>
      {splash && <Splash onDone={endSplash} />}

      {/* Header as it will look in the app */}
      <header className="ct-rail sticky top-0 z-10">
        <div className="flex min-h-[56px] items-center justify-between gap-2 px-4">
          <Wordmark size="sm" />
          <div className="flex items-center">
            <button type="button" aria-label="Refresh" className="ct-focus grid min-h-[48px] min-w-[48px] place-items-center text-lg">
              ⟳
            </button>
            <button
              type="button"
              aria-label="Toggle theme"
              className="ct-focus grid min-h-[48px] min-w-[48px] place-items-center text-lg"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "☾" : "☀"}
            </button>
          </div>
        </div>
      </header>
      <p className="ct-muted px-4 pt-2 text-xs">Last updated: Oct 24, 11:48 PM · style preview (dev only)</p>

      <main className="mx-auto max-w-[430px] px-4 pt-4 pb-16">
        <Section title="Wordmark & splash" suit="♠">
          <div className="ct-panel flex flex-col items-center gap-5 p-6">
            <Wordmark size="lg" />
            <Wordmark size="md" />
            <Wordmark size="sm" />
            <div className="flex items-end gap-4">
              <ChipBadge size={64} />
              <ChipBadge size={40} />
              <ChipBadge size={30} />
              <ChipBadge size={22} />
            </div>
            <p className="ct-muted text-center text-xs">
              One brand chip everywhere (same art as the app icon). Under 44px the inlay and spade drop out.
            </p>
            <button type="button" className="ct-btn ct-btn-secondary" onClick={() => setSplash(true)}>
              {reduced ? "Splash is skipped (reduced motion)" : "Show splash"}
            </button>
          </div>
        </Section>

        <Section title="Palette" suit="♥">
          <div className="grid grid-cols-3 gap-2">
            {PALETTE[theme].map(([name, hex]) => (
              <div key={name} className="ct-panel overflow-hidden">
                <div className="h-12" style={{ background: hex }} />
                <div className="p-2 text-xs">
                  <div className="font-medium">{name}</div>
                  <div className="ct-muted ct-num">{hex}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="ct-panel mt-3 p-3 text-sm">
            <div className="mb-2 font-semibold">Contrast (WCAG AA: 4.5 text, 3.0 large/UI)</div>
            {CONTRAST_PAIRS[theme].map(([label, fg, bg]) => {
              const ratio = contrast(fg, bg);
              return (
                <div key={label} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex items-center gap-2">
                    <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ color: fg, background: bg }}>
                      Aa
                    </span>
                    {label}
                  </span>
                  <span className={`ct-num font-semibold ${ratio >= 4.5 ? "ct-win" : "ct-loss"}`}>
                    {ratio.toFixed(1)} {ratio >= 4.5 ? "AA" : "fail"}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Typography" suit="♦">
          <div className="ct-panel space-y-2 p-4">
            <div className="ct-display text-4xl font-bold">Season 2</div>
            <div className="ct-display text-2xl font-semibold">Game history</div>
            <div className="ct-display text-xl font-semibold">Fri 24 Oct</div>
            <p className="text-base">Body: Inter 16px. Clean and readable at night on a phone.</p>
            <p className="ct-muted text-sm">Secondary: 14px, warm muted ivory.</p>
            <p className="ct-muted text-xs tracking-wide uppercase">Caption · 12px</p>
            <div className="ct-num mt-3 grid grid-cols-2 gap-x-6 text-lg">
              {[1100, -100, -1000, 11450, -300, 0].map((v, i) => (
                <span key={i} className={`text-right ${v > 0 ? "ct-win" : v < 0 ? "ct-loss" : ""}`}>
                  {formatSignedDollars(v)}
                </span>
              ))}
            </div>
            <p className="ct-muted text-xs">Tabular figures: the columns line up digit for digit.</p>
          </div>
        </Section>

        <Section title="Buttons" suit="♣">
          <div className="ct-panel space-y-3 p-4">
            <button type="button" className="ct-btn ct-btn-primary w-full">
              Start game
            </button>
            <div className="flex gap-2">
              <button type="button" className="ct-btn ct-btn-secondary flex-1">
                Secondary
              </button>
              <button type="button" className="ct-btn ct-btn-danger flex-1">
                Discard game
              </button>
            </div>
            <button type="button" className="ct-btn ct-btn-primary w-full" disabled>
              Disabled
            </button>
            <div className="grid grid-cols-4 justify-items-center gap-2 pt-2">
              {(["red", "blue", "black", "green"] as const).map((tone, i) => (
                <button key={tone} type="button" className="ct-chip" data-tone={tone} onClick={(e) => chipFeedback(e.currentTarget)}>
                  {formatDollars([1000, 1500, 2000, 500][i]!)}
                </button>
              ))}
            </div>
            <p className="ct-muted text-xs">Chips are 56–80px (grow with the card), press down on touch, and pop when tapped.</p>
          </div>
        </Section>

        <Section title="Leaderboard" suit="♠">
          <Leaderboard key={staggerKey} rows={rows} me="d" animate />
          <div className="mt-3 flex gap-2">
            <button type="button" className="ct-btn ct-btn-secondary flex-1" onClick={() => setRows((r) => playNight(r))}>
              Play a game night
            </button>
            <button type="button" className="ct-btn ct-btn-secondary flex-1" onClick={() => setStaggerKey((k) => k + 1)}>
              Replay entrance
            </button>
          </div>
          <div className="ct-panel ct-panel-brass mt-4 flex items-center gap-3 p-4">
            <Crown className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="ct-muted text-xs tracking-wide uppercase">Season 1 champion</div>
              <div className="ct-display text-xl font-semibold">Shreyas</div>
            </div>
            <Money value={6200} />
          </div>
        </Section>

        <Section title="Live game" suit="♥">
          <LiveCard />
        </Section>

        <Section title="Chip check" suit="♦">
          <div className="space-y-4">
            <ChipCheck pass={false} />
            <ChipCheck pass />
          </div>
        </Section>

        <Section title="App icon" suit="♣">
          <div className="ct-panel p-4">
            <div className="flex items-end justify-around">
              <AppIconSvg size={128} />
              <AppIconSvg size={72} />
              <AppIconSvg size={40} />
            </div>
            <div className="mt-5 flex items-end justify-around">
              <figure className="flex flex-col items-center gap-1">
                <div style={{ clipPath: "circle(40% at 50% 50%)" }}>
                  <AppIconSvg size={110} maskable />
                </div>
                <figcaption className="ct-muted text-xs">Android (maskable)</figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-1">
                <div className="overflow-hidden" style={{ borderRadius: 24 }}>
                  <AppIconSvg size={96} maskable />
                </div>
                <figcaption className="text-xs">CT51</figcaption>
              </figure>
            </div>
          </div>
        </Section>

        <Section title="Motion" suit="♠">
          <div className="ct-panel space-y-3 p-4 text-sm">
            <p>
              Reduced motion is <strong>{reduced ? "ON — animations are off" : "off"}</strong> on this device.
            </p>
            <ul className="ct-muted list-disc space-y-1 pl-5">
              <li>Leaderboard rows rise in with a stagger (Replay entrance).</li>
              <li>Amounts count up; ranks slide to their new place (Play a game night).</li>
              <li>Chips pop and buzz (Android) on tap — after the buy-in is recorded.</li>
              <li>The splash chip drops in and settles (Show splash).</li>
              <li>Screens fade/slide in. The live game and end screens never animate.</li>
            </ul>
            <div className="flex gap-2">
              {["Leaderboard", "Games"].map((name, i) => (
                <button key={name} type="button" className={`ct-btn flex-1 ${screen === i ? "ct-btn-primary" : "ct-btn-secondary"}`} onClick={() => setScreen(i)}>
                  {name}
                </button>
              ))}
            </div>
            <div key={screen} className="ct-screen ct-panel p-4">
              <SuitHeading suit={screen === 0 ? "♠" : "♣"} as="h3">
                {screen === 0 ? "Leaderboard screen" : "Game history screen"}
              </SuitHeading>
              <p className="ct-muted mt-1">Screen transition: 180ms fade + slide.</p>
            </div>
          </div>
        </Section>

        <footer className="ct-muted pt-4 text-center text-xs">Paisa he paisa hoga, hehehe 💸</footer>
      </main>
    </div>
  );
}
