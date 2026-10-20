import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Change } from "../domain/adminOps.js";
import { useData } from "../state/DataContext.js";
import { isLoggedIn, subscribe } from "../storage/auth.js";
import { saveChange } from "../storage/githubWrite.js";

// Design-system classes (src/design/design.css, CLAUDE.md §11).
export const btnPrimary = "ct-btn ct-btn-primary";
export const btnSecondary = "ct-btn ct-btn-secondary";
export const btnDanger = "ct-btn ct-btn-danger";
export const input = "ct-input";
export const muted = "text-ink-muted";

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
// each further prompt (e.g. discarding a live game asks twice). `validate` runs on the first tap: when it
// returns false (the form shows its own inline errors) the confirm doesn't open. `details` shows under
// the last prompt (e.g. an edit's list of changes).
export function ConfirmButton({
  label,
  prompts,
  confirmLabel,
  onConfirm,
  className = btnSecondary,
  disabled,
  validate,
  details,
}: {
  label: ReactNode;
  prompts: string[];
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
  validate?: () => boolean;
  details?: ReactNode;
}) {
  const [step, setStep] = useState(0);
  if (step === 0) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => (!validate || validate()) && setStep(1)}>
        {label}
      </button>
    );
  }
  const last = step === prompts.length;
  return (
    <div role="group" className="ct-panel ct-panel-brass flex flex-col gap-2 p-3">
      <p className="font-medium">{prompts[step - 1]}</p>
      {last && details}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btnPrimary} flex-1`}
          disabled={disabled}
          onClick={() => {
            if (!last) return setStep(step + 1);
            setStep(0);
            onConfirm();
          }}
        >
          {last ? confirmLabel : "Yes, continue"}
        </button>
        <button type="button" className={`${btnSecondary} flex-1`} onClick={() => setStep(0)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
