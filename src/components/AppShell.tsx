import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Splash, Wordmark } from "../design/components.js";
import { IconLock, IconRefresh } from "../design/icons.js";
import { prefersReducedMotion } from "../design/motion.js";
import { useData } from "../state/DataContext.js";
import { useTheme } from "../state/useTheme.js";
import { isUpdateReady, reloadIntoNewVersion, reloader, subscribeUpdateReady } from "../lib/appUpdate.js";
import { formatLastUpdated } from "../lib/format.js";
import { hasLocalGame, queuedCount, subscribeLocalChange } from "../storage/localKeys.js";

const NAV_ITEMS = [
  { to: "/", label: "Leaderboard", suit: "♠" },
  { to: "/games", label: "Games", suit: "♣" },
  { to: "/seasons", label: "Seasons", suit: "♦" },
  { to: "/more", label: "More", suit: "♥" },
];

// The live game and end screens are where the admin taps fast: they never animate in.
const INSTANT_PATHS = ["/admin/live", "/admin/end"];
const INTRO_KEY = "ct51.introShown";

// The intro plays once per app launch (tab session), never when launching straight into a live game.
function shouldPlayIntro(pathname: string): boolean {
  if (INSTANT_PATHS.includes(pathname) || prefersReducedMotion()) return false;
  try {
    if (sessionStorage.getItem(INTRO_KEY)) return false;
    sessionStorage.setItem(INTRO_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

const pill = "flex min-h-[48px] shrink-0 items-center";
const pillInner = "ct-pill";

// Only ever shows on the admin's phone: it reads the live-game / sync-queue keys, never admin code.
function LocalStatus() {
  const queued = useSyncExternalStore(subscribeLocalChange, queuedCount);
  const live = useSyncExternalStore(subscribeLocalChange, hasLocalGame);
  return (
    <>
      {live && (
        <Link to="/admin/live" className={pill}>
          <span className={pillInner}>♠ Game on</span>
        </Link>
      )}
      {queued > 0 && (
        <Link to="/admin" className={pill}>
          <span className={pillInner}>Not synced: {queued}</span>
        </Link>
      )}
    </>
  );
}

// A new version activated while on an admin screen: never auto-reload there (it would log the admin out
// or interrupt a game). The admin reloads when ready; any game in progress is saved on this phone.
function UpdateBanner() {
  const ready = useSyncExternalStore(subscribeUpdateReady, isUpdateReady);
  if (!ready) return null;
  return (
    <div role="status" className="ct-panel ct-panel-brass mx-4 mt-2 flex items-center justify-between gap-2 px-3 py-1 text-sm">
      <span>Update ready — reload when the game ends.</span>
      <button
        type="button"
        className="ct-focus min-h-[48px] shrink-0 px-2 font-semibold text-brass underline"
        onClick={() => {
          reloader.clear();
          void reloadIntoNewVersion();
        }}
      >
        Reload
      </button>
    </div>
  );
}

function navClassName({ isActive }: { isActive: boolean }): string {
  return `ct-nav-item ct-focus ${isActive ? "ct-nav-active" : ""}`;
}

export function AppShell() {
  const { lastUpdated, loading, error, fromCache, refresh } = useData();
  const { pathname } = useLocation();
  const [intro, setIntro] = useState(() => shouldPlayIntro(pathname));
  const endIntro = useCallback(() => setIntro(false), []);
  const main = useRef<HTMLElement>(null);
  const firstPath = useRef(true);
  useTheme();

  // Screen transition: animate the page area in place (never remount it: admin screens keep state).
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    window.scrollTo(0, 0);
    if (INSTANT_PATHS.includes(pathname) || prefersReducedMotion()) return;
    main.current?.animate(
      [
        { opacity: 0, transform: "translateX(10px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 180, easing: "ease-out" },
    );
  }, [pathname]);

  return (
    <div className="ct-app flex min-h-screen flex-col">
      {intro && <Splash onDone={endIntro} />}

      <header className="ct-rail ct-safe-top sticky top-0 z-20">
        <div className="flex min-h-[56px] items-center justify-between gap-1 pr-1 pl-4">
          <Link to="/" className="ct-focus flex min-h-[48px] min-w-0 items-center rounded-md" aria-label="Chestnut Table 51, leaderboard">
            <Wordmark size="sm" />
          </Link>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh"
              className="ct-focus grid min-h-[48px] min-w-[48px] place-items-center rounded-md disabled:opacity-60"
            >
              <IconRefresh spinning={loading} />
            </button>
            <NavLink to="/admin" aria-label="Admin" className="ct-focus grid min-h-[48px] min-w-[48px] place-items-center rounded-md">
              <IconLock />
            </NavLink>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-x-3 px-4 text-xs text-ink-muted">
        <span className="py-2">Last updated: {formatLastUpdated(lastUpdated)}</span>
        <span className="flex gap-2">
          <LocalStatus />
        </span>
      </div>

      <UpdateBanner />

      {error && (
        <p role="status" className="ct-panel ct-panel-brass mx-4 mt-2 px-3 py-2 text-sm">
          {error}
          {fromCache && " Showing the last saved copy."}
        </p>
      )}

      <main ref={main} className="ct-main flex-1">
        <Outlet />
      </main>

      <footer className="ct-footer px-4 pt-6 text-center text-xs text-ink-muted">
        <span aria-hidden="true" className="mr-2 tracking-[0.3em] text-brass">
          ♠♥♦♣
        </span>
        Paisa he paisa hoga, hehehe 💸
      </footer>

      <nav className="ct-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navClassName} end={item.to === "/"}>
            <span aria-hidden="true" className="text-lg leading-none">
              {item.suit}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
