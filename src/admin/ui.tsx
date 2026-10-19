import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Change } from "../domain/adminOps.js";
import { useData } from "../state/DataContext.js";
import { isLoggedIn, subscribe } from "../storage/auth.js";
import { saveChange } from "../storage/githubWrite.js";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chestnut-400";

export const btnPrimary = `min-h-[48px] rounded-lg bg-chestnut-500 px-4 font-semibold text-white disabled:opacity-50 ${focus}`;
export const btnSecondary = `min-h-[48px] rounded-lg border border-felt-700 px-3 disabled:opacity-50 ${focus}`;
export const input = `min-h-[48px] w-full rounded-lg border border-felt-700 bg-transparent px-3 ${focus}`;
export const muted = "text-felt-950/60 dark:text-white/60";
export const btnDanger = `min-h-[48px] rounded-lg border border-loss px-3 text-loss disabled:opacity-50 ${focus}`;

export function useLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, isLoggedIn);
}

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };

// Runs one admin write and pushes the written data into the UI. Returns true on success.
export function useSave() {
  const { applySaved } = useData();
  const [state, setState] = useState<SaveState>({ status: "idle" });

  const save = useCallback(
    async (change: Change, commitMessage: string, successText: string): Promise<boolean> => {
      setState({ status: "saving" });
      try {
        const result = await saveChange(change, commitMessage);
        applySaved(result.data);
        setState({ status: "saved", message: successText });
        return true;
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Save failed." });
        return false;
      }
    },
    [applySaved],
  );

  return { save, saving: state.status === "saving", state };
}

export function SaveStatus({ state }: { state: SaveState }) {
  const text = state.status === "saving" ? "Saving…" : state.message;
  return (
    <p role="status" aria-live="polite" className={`min-h-[1.5rem] text-sm ${state.status === "error" ? "text-loss" : muted}`}>
      {text}
    </p>
  );
}

// Inline confirm (CLAUDE.md §11): the first tap asks, the second does it. `steps` > 1 asks again with
// each further prompt (e.g. discarding a live game asks twice).
export function ConfirmButton({
  label,
  prompts,
  confirmLabel,
  onConfirm,
  className = btnSecondary,
  disabled,
}: {
  label: ReactNode;
  prompts: string[];
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [step, setStep] = useState(0);
  if (step === 0) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setStep(1)}>
        {label}
      </button>
    );
  }
  const last = step === prompts.length;
  return (
    <div role="group" className="flex flex-col gap-2 rounded-lg border border-chestnut-400 p-3">
      <p className="font-medium">{prompts[step - 1]}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={disabled}
          onClick={() => {
            if (!last) return setStep(step + 1);
            setStep(0);
            onConfirm();
          }}
        >
          {last ? confirmLabel : "Yes, continue"}
        </button>
        <button type="button" className={btnSecondary} onClick={() => setStep(0)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
