import { EmptyState, Loading, PageTitle } from "../design/components.js";
import { useState, type FormEvent } from "react";
import { MAX_PRESETS, presetBuyInsError, setPresetBuyIns } from "../domain/adminOps.js";
import { presetBuyInsMessage } from "../domain/commitMessages.js";
import type { Data } from "../domain/types.js";
import { useData } from "../state/DataContext.js";
import { SaveStatus, btnPrimary, btnSecondary, input, muted, useSave } from "./ui.js";

// Whole dollars only: "1,500" and "$1500" are fine, "12.5" or "abc" are not.
function parseAmount(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

function PresetForm({ data }: { data: Data }) {
  const saved = data.settings.presetBuyIns;
  const [rows, setRows] = useState<string[]>(() => saved.map(String));
  const { save, saving, state } = useSave();

  const amounts = rows.map(parseAmount);
  const error = presetBuyInsError(amounts);
  const unchanged =
    amounts.length === saved.length && [...amounts].sort((a, b) => a - b).every((a, i) => a === saved[i]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (error) return;
    const ok = await save(setPresetBuyIns(amounts), presetBuyInsMessage(amounts), "Preset buy-ins saved.");
    if (ok) setRows([...amounts].sort((a, b) => a - b).map(String));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <h2 className="font-semibold">Preset buy-in amounts</h2>
      <p className={`text-sm ${muted}`}>
        Shown as big buttons during a game. 1 to {MAX_PRESETS} amounts, whole dollars in multiples of $5 (the smallest chip).
      </p>
      {rows.map((value, i) => (
        <div key={i} className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="sr-only">Preset {i + 1}</span>
            <input
              className={input}
              inputMode="numeric"
              value={value}
              onChange={(e) => setRows(rows.map((r, j) => (j === i ? e.target.value : r)))}
            />
          </label>
          <button
            type="button"
            className={btnSecondary}
            aria-label={`Remove preset ${i + 1}`}
            disabled={saving || rows.length <= 1}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className={btnSecondary}
        disabled={saving || rows.length >= MAX_PRESETS}
        onClick={() => setRows([...rows, ""])}
      >
        Add amount
      </button>
      {error && rows.every((r) => r.trim() !== "") && <p className="text-sm text-loss">{error}</p>}
      <button type="submit" className={btnPrimary} disabled={saving || error !== null || unchanged}>
        Save presets
      </button>
      <SaveStatus state={state} />
    </form>
  );
}

export function Settings() {
  const { data, loading } = useData();

  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <div className="p-4">
        <EmptyState suit="♦" title="No data yet" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♣" title="Settings" />
      <PresetForm data={data} />
    </div>
  );
}
