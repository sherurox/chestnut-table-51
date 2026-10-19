// Keeps every open copy of CT51 on the deployed version.
//
// 1. A stale page (old entry chunk) that lazy-loads a chunk deleted by a newer deploy gets a 404. We
//    reload once to pick up the new version; a sessionStorage flag stops a reload loop. Live games and the
//    sync queue are in localStorage, so a reload never loses them.
// 2. When a new service worker takes control, open pages reload — except on admin screens, where a reload
//    would log the admin out (token is memory-only) or interrupt a game: those get an "Update ready" banner.

export const RELOAD_FLAG_KEY = "ct51.reloadedForUpdate";

export interface ReloaderDeps {
  session: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  reload: () => void;
  isOnline: () => boolean;
}

// Chrome, Safari and Firefox word a failed dynamic import differently.
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload/i.test(
    message,
  );
}

export function createReloader(deps: ReloaderDeps) {
  let reloading = false;
  return {
    isReloading: () => reloading,
    // True if a reload is (now) under way, so the caller should wait for it instead of showing an error.
    // At most one automatic reload per tab session; offline, a reload can't fetch the new version anyway.
    reloadOnce(): boolean {
      if (reloading) return true;
      if (!deps.isOnline() || !deps.session) return false;
      try {
        if (deps.session.getItem(RELOAD_FLAG_KEY) !== null) return false;
        deps.session.setItem(RELOAD_FLAG_KEY, String(Date.now()));
      } catch {
        return false; // no way to guard against a loop: don't auto-reload
      }
      reloading = true;
      deps.reload();
      return true;
    },
    // After a chunk loads fine, allow one automatic reload again for the next deploy.
    clear(): void {
      try {
        deps.session?.removeItem(RELOAD_FLAG_KEY);
      } catch {
        // ignore
      }
    },
  };
}

// Admin screens never auto-reload on a service worker update (see 2. above).
export function shouldDeferUpdate(hash: string): boolean {
  return /^#\/admin(\/|$|\?)/.test(hash);
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

// Reload into the newest deployed version. Right after a deploy the old service worker may still control
// the page and would serve the old index.html again, so first ask for the new worker and give it a moment
// to take over (it calls skipWaiting), then reload.
export async function reloadIntoNewVersion(waitMs = 8000): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      const tookOver = new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
      );
      await registration.update();
      if (registration.installing || registration.waiting) {
        await Promise.race([tookOver, new Promise((resolve) => setTimeout(resolve, waitMs))]);
      }
    }
  } catch {
    // no service worker or update check failed: a plain reload is the best we can do
  }
  window.location.reload();
}

export const reloader = createReloader({
  session: safeSession(),
  reload: () => void reloadIntoNewVersion(),
  isOnline: () => typeof navigator === "undefined" || navigator.onLine,
});

// --- "Update ready" banner state -------------------------------------------------------------------

let updateReady = false;
const listeners = new Set<() => void>();

export function isUpdateReady(): boolean {
  return updateReady;
}

export function subscribeUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function markUpdateReady(): void {
  updateReady = true;
  for (const l of listeners) l();
}

export function onNewVersionActive(hash: string, reload: () => void): void {
  if (shouldDeferUpdate(hash)) markUpdateReady();
  else reload();
}

// Replaces vite-plugin-pwa's injected registerSW.js so we decide what happens when a new version takes over.
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  // A page that loaded without a controller is on the first install: nothing stale to replace.
  let hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloader.isReloading()) return; // reloadIntoNewVersion is already on it
    onNewVersionActive(window.location.hash, () => window.location.reload());
  });

  // A lazy chunk failed to load (e.g. deleted by a newer deploy). Start the one reload here; the error
  // still propagates, and the lazy() catch in App.tsx sees the reload under way and waits for it.
  window.addEventListener("vite:preloadError", () => {
    reloader.reloadOnce();
  });

  const base = import.meta.env.BASE_URL;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        // An installed PWA can stay open for days: look for a new version whenever it comes back to front.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update().catch(() => {});
        });
      })
      .catch(() => {
        // offline first load, or SW unsupported here: the app still works online
      });
  });
}
