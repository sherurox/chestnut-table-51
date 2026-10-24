import { CHIP_SET } from "../config.js";

// A chip colour swatch and a − / number / + stepper (≥48px), shared by the chip calculator (#/chips) and the
// end screen's "Count chips" mode.

export const colorName = (color: string) => color[0]!.toUpperCase() + color.slice(1);

export function ChipSwatch({ index }: { index: number }) {
  const chip = CHIP_SET[index]!;
  return (
    <span className="ct-chip ct-chip-swatch" data-tone={chip.color} aria-hidden="true">
      {chip.value}
    </span>
  );
}

export function Stepper({
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
