import { useSyncExternalStore } from "react";
import { browserStore, notifyLocalChange, subscribeLocalChange, type KeyValueStore } from "../storage/localKeys.js";

// Chip mode (Table tools step E), a per-device setting on More: On shows the buy-in chip suggestion, the
// box line and per-colour counting on the end screen; Off gives the plain dollar flow. Default On.

export const CHIP_MODE_KEY = "ct51.chipMode";

export function readChipMode(store: Pick<KeyValueStore, "getItem"> | null = browserStore()): boolean {
  try {
    return store?.getItem(CHIP_MODE_KEY) !== "off";
  } catch {
    return true; // storage blocked: the default
  }
}

export function saveChipMode(on: boolean, store: KeyValueStore | null = browserStore()): void {
  try {
    if (on) store?.removeItem(CHIP_MODE_KEY);
    else store?.setItem(CHIP_MODE_KEY, "off");
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
  notifyLocalChange();
}

export function useChipMode(): boolean {
  return useSyncExternalStore(subscribeLocalChange, () => readChipMode(), () => true);
}
