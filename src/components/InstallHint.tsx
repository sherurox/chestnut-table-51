import { useState, useSyncExternalStore } from "react";
import { INSTALL_HINT_DISMISSED_KEY, installHint, isIosSafari } from "../lib/installHint.js";
import { canPromptInstall, promptInstall, subscribeInstallPrompt } from "../lib/installPrompt.js";
import { isIos, isStandalone } from "../lib/platform.js";
import { browserStore } from "../storage/localKeys.js";

function readDismissed(): boolean {
  try {
    return (browserStore()?.getItem(INSTALL_HINT_DISMISSED_KEY) ?? null) !== null;
  } catch {
    return false;
  }
}

// Home (#/): a small dismissible card. iOS Safari: how to add CT51 to the home screen. Android Chrome: an
// "Install app" button once the browser offers it. Hidden when installed or dismissed.
export function InstallHint() {
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall);
  const [dismissed, setDismissed] = useState(readDismissed);
  const kind = installHint({
    iosSafari: typeof navigator !== "undefined" && isIosSafari(navigator.userAgent, isIos()),
    standalone: isStandalone(),
    dismissed,
    canPrompt,
  });
  if (!kind) return null;

  function dismiss() {
    setDismissed(true);
    try {
      browserStore()?.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // best effort: hidden for this visit anyway
    }
  }

  return (
    <aside aria-label="Install CT51" className="ct-panel mb-4 flex items-center gap-2 py-1 pr-1 pl-4">
      <p className="min-w-0 flex-1 py-2 text-sm">
        {kind === "ios" ? (
          <>
            <span className="font-semibold">Install CT51:</span> tap Share, then Add to Home Screen
          </>
        ) : (
          <span className="font-semibold">Get CT51 on your home screen</span>
        )}
      </p>
      {kind === "android" && (
        <button type="button" className="ct-btn ct-btn-primary shrink-0 px-4" onClick={() => void promptInstall()}>
          Install app
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss install hint"
        className="ct-focus grid min-h-[48px] min-w-[48px] shrink-0 place-items-center rounded-md text-ink-muted"
        onClick={dismiss}
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ×
        </span>
      </button>
    </aside>
  );
}
