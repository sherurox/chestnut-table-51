// Chrome's beforeinstallprompt fires once, early, maybe before React has mounted, so it is caught here
// (installed from main.tsx) and kept for Home's "Install app" button. `appinstalled` hides the button.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function installPromptListener(target: Window): void {
  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  target.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The event can be used only once, whatever the outcome.
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  notify();
  await event.prompt();
  await event.userChoice.catch(() => undefined);
}
