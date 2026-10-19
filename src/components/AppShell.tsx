import { NavLink, Outlet } from "react-router-dom";
import { useData } from "../state/DataContext.js";
import { useTheme } from "../state/useTheme.js";
import { formatLastUpdated } from "../lib/format.js";

const NAV_ITEMS = [
  { to: "/", label: "Leaderboard" },
  { to: "/games", label: "Games" },
  { to: "/seasons", label: "Seasons" },
  { to: "/more", label: "More" },
];

function navClassName({ isActive }: { isActive: boolean }): string {
  return `flex min-h-[48px] flex-1 items-center justify-center text-sm ${
    isActive ? "text-chestnut-400" : "text-felt-950 dark:text-white/70"
  }`;
}

export function AppShell() {
  const { lastUpdated, loading, error, fromCache, refresh } = useData();
  useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-white text-felt-950 dark:bg-felt-950 dark:text-white">
      <div className="flex flex-1 flex-col pb-20">
        <header className="flex min-h-[48px] items-center justify-between gap-2 px-4 py-2">
          <span className="font-semibold">CT51</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-felt-950/60 dark:text-white/50">
            <span className="truncate">Last updated: {formatLastUpdated(lastUpdated)}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh"
              className="flex min-h-[48px] min-w-[48px] items-center justify-center text-base disabled:opacity-50"
            >
              {loading ? "…" : "⟳"}
            </button>
          </div>
          <NavLink
            to="/admin"
            aria-label="Admin login"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center"
          >
            🔒
          </NavLink>
        </header>

        {error && (
          <p className="px-4 py-2 text-sm text-chestnut-400">
            {error}
            {fromCache && " Showing the last saved copy."}
          </p>
        )}

        <main className="flex-1">
          <Outlet />
        </main>

        <footer className="px-4 py-2 text-center text-xs text-felt-950/60 dark:text-white/50">
          Play money only — no real gambling.
        </footer>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-felt-700 bg-white dark:bg-felt-900">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navClassName} end={item.to === "/"}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
