import { useId, useState } from "react";
import { CHIP_SET } from "../config.js";
import { PageTitle, SuitHeading } from "../design/components.js";
import { chipSplit, chipTotal } from "../domain/chips.js";
import {
  CHIP_CALC_PRESETS,
  chipSplitMessage,
  MAX_PLAYERS,
  MIN_PLAYERS,
  parseBuyIn,
  readChipCalc,
  saveChipCalc,
  type ChipCalcChoice,
} from "../lib/chipCalc.js";
import { formatDollars } from "../lib/format.js";
import { browserStore } from "../storage/localKeys.js";

// Chip calculator (#/chips, Table tools step C): how many chips of each colour every player gets for a
// buy-in, and the value of a counted stack. Standalone: nothing here reads or writes game data.

const colorName = (color: string) => color[0]!.toUpperCase() + color.slice(1);

function ChipSwatch({ index }: { index: number }) {
  const chip = CHIP_SET[index]!;
  return (
    <span className="ct-chip ct-chip-swatch" data-tone={chip.color} aria-hidden="true">
      {chip.value}
    </span>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  input,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  input?: { text: string; onText: (text: string) => void };
}) {
  return (
    <div className="flex flex-none items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="ct-btn ct-btn-secondary ct-focus w-12 px-0 text-xl" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      {input ? (
        <input
          className="ct-input ct-num w-16 px-1 text-center"
          inputMode="numeric"
          aria-label={label}
          placeholder="0"
          value={input.text}
          onChange={(e) => input.onText(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      ) : (
        <span className="ct-num w-12 text-center text-xl font-semibold" aria-live="polite">
          {value}
        </span>
      )}
      <button type="button" className="ct-btn ct-btn-secondary ct-focus w-12 px-0 text-xl" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function ChipCalculator() {
  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♦" title="Chip calculator" subtitle="Hand out buy-ins and count stacks. Nothing here is saved to the game." />
      <HandOut />
      <CountStack />
    </div>
  );
}

function HandOut() {
  const [choice, setChoice] = useState<ChipCalcChoice>(() => readChipCalc(browserStore()));
  const isPreset = (CHIP_CALC_PRESETS as readonly number[]).includes(choice.buyIn);
  const [customText, setCustomText] = useState<string | null>(() => (isPreset ? null : String(choice.buyIn)));
  const errorId = useId();

  const update = (next: ChipCalcChoice) => {
    setChoice(next);
    saveChipCalc(browserStore(), next);
  };
  const parsed = customText === null ? null : parseBuyIn(customText);
  const customError = parsed && "error" in parsed ? parsed.error : null;
  const onCustomText = (text: string) => {
    setCustomText(text);
    const result = parseBuyIn(text);
    if ("amount" in result) update({ ...choice, buyIn: result.amount });
  };

  const split = chipSplit(choice.buyIn, choice.players);

  return (
    <section className="mb-6" aria-labelledby="chips-hand-out">
      <div id="chips-hand-out">
        <SuitHeading suit="♠">Hand out</SuitHeading>
      </div>
      <div className="ct-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Players</span>
          <Stepper label="Players" value={choice.players} min={MIN_PLAYERS} max={MAX_PLAYERS} onChange={(players) => update({ ...choice, players })} />
        </div>

        <p className="mt-4 mb-2 font-semibold">Buy-in</p>
        <div className="grid grid-cols-3 gap-2">
          {CHIP_CALC_PRESETS.map((amount) => {
            const selected = customText === null && choice.buyIn === amount;
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={selected}
                className={`ct-btn ct-focus ct-num px-1 ${selected ? "ct-btn-primary" : "ct-btn-secondary"}`}
                onClick={() => {
                  setCustomText(null);
                  update({ ...choice, buyIn: amount });
                }}
              >
                {formatDollars(amount)}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customText !== null}
            className={`ct-btn ct-focus col-span-3 ${customText !== null ? "ct-btn-primary" : "ct-btn-secondary"}`}
            onClick={() => setCustomText((text) => text ?? "")}
          >
            Custom amount
          </button>
        </div>
        {customText !== null && (
          <label className="mt-3 block">
            <span className="mb-1 block text-sm text-ink-muted">Custom buy-in (multiple of $5)</span>
            <input
              className="ct-input ct-num"
              inputMode="numeric"
              placeholder="e.g. 1250"
              value={customText}
              aria-invalid={customError !== null}
              aria-describedby={customError ? errorId : undefined}
              onChange={(e) => onCustomText(e.target.value)}
              autoFocus
            />
            {customError && (
              <span id={errorId} className="mt-1 block text-sm text-loss">
                {customError}
              </span>
            )}
          </label>
        )}
      </div>

      <div className="ct-panel mt-3 p-4" aria-live="polite">
        {customError ? (
          <p className="text-ink-muted">Enter a buy-in to see the split.</p>
        ) : !split.ok ? (
          <p role="alert" className="text-loss">
            {chipSplitMessage(split)}
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink-muted">
              Each player gets {split.chipsPerPlayer} chips worth <span className="ct-num">{formatDollars(split.valuePerPlayer)}</span>.
            </p>
            <ul>
              {CHIP_SET.map((chip, i) => (
                <li key={chip.color} className="flex min-h-[56px] items-center gap-3 border-b border-line py-2 last:border-b-0">
                  <ChipSwatch index={i} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{colorName(chip.color)}</p>
                    <p className="text-sm text-ink-muted">
                      <span className="ct-num">{split.leftInBox[i]}</span> left in box
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="ct-num font-semibold">
                      {split.perPlayer[i]} × {formatDollars(chip.value)}
                    </p>
                    <p className="ct-num text-sm text-ink-muted">{formatDollars(split.perPlayer[i]! * chip.value)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
              <dt>Per player</dt>
              <dd className="ct-num text-right font-semibold">
                {split.chipsPerPlayer} chips · {formatDollars(split.valuePerPlayer)}
              </dd>
              <dt>
                Table ({choice.players} × {formatDollars(split.valuePerPlayer)})
              </dt>
              <dd className="ct-num text-right font-semibold">{formatDollars(choice.players * split.valuePerPlayer)}</dd>
              <dt>Left in box</dt>
              <dd className="ct-num text-right">{formatDollars(split.boxValue - choice.players * split.valuePerPlayer)}</dd>
              <dt className="text-ink-muted">Box total</dt>
              <dd className="ct-num text-right text-ink-muted">{formatDollars(split.boxValue)}</dd>
            </dl>
          </>
        )}
      </div>
    </section>
  );
}

function CountStack() {
  const [texts, setTexts] = useState<string[]>(() => CHIP_SET.map(() => ""));
  const counts = texts.map((t) => (t === "" ? 0 : Number(t)));
  const total = chipTotal(counts);
  const setCount = (i: number, text: string) => setTexts((prev) => prev.map((t, j) => (j === i ? text : t)));

  return (
    <section aria-labelledby="chips-count">
      <div id="chips-count">
        <SuitHeading suit="♣">Count a stack</SuitHeading>
      </div>
      <div className="ct-panel p-4">
        <ul>
          {CHIP_SET.map((chip, i) => (
            <li key={chip.color} className="flex min-h-[56px] items-center gap-2 border-b border-line py-2 last:border-b-0">
              <ChipSwatch index={i} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{colorName(chip.color)}</p>
                <p className="ct-num text-sm text-ink-muted">{formatDollars(counts[i]! * chip.value)}</p>
              </div>
              <Stepper
                label={`${colorName(chip.color)} ${formatDollars(chip.value)} chips`}
                value={counts[i]!}
                min={0}
                max={9999}
                onChange={(next) => setCount(i, next === 0 ? "" : String(next))}
                input={{ text: texts[i]!, onText: (text) => setCount(i, text) }}
              />
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p aria-live="polite">
            <span className="block text-sm text-ink-muted">Total</span>
            <span className="ct-display ct-num text-3xl">{formatDollars(total)}</span>
          </p>
          <button type="button" className="ct-btn ct-btn-secondary ct-focus" disabled={total === 0 && texts.every((t) => t === "")} onClick={() => setTexts(CHIP_SET.map(() => ""))}>
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
