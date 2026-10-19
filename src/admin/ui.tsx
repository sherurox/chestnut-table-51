import { useCallback, useState, useSyncExternalStore } from "react";
import type { Change } from "../domain/adminOps.js";
import { useData } from "../state/DataContext.js";
import { isLoggedIn, subscribe } from "../storage/auth.js";
import { saveChange } from "../storage/githubWrite.js";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chestnut-400";

export const btnPrimary = `min-h-[48px] rounded-lg bg-chestnut-500 px-4 font-semibold text-white disabled:opacity-50 ${focus}`;
export const btnSecondary = `min-h-[48px] rounded-lg border border-felt-700 px-3 disabled:opacity-50 ${focus}`;
export const input = `min-h-[48px] w-full rounded-lg border border-felt-700 bg-transparent px-3 ${focus}`;
export const muted = "text-felt-950/60 dark:text-white/60";

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
