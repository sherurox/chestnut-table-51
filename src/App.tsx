import { lazy, Suspense, useEffect } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { RouteError } from "./components/RouteError.js";
import { reloader } from "./lib/appUpdate.js";
import { installViewTransitionGuard } from "./lib/viewTransitions.js";
import { DataProvider } from "./state/DataContext.js";
import { Leaderboard } from "./screens/Leaderboard.js";
import { GameHistory } from "./screens/GameHistory.js";
import { GameDetail } from "./screens/GameDetail.js";
import { PlayerPage } from "./screens/PlayerPage.js";
import { Seasons } from "./screens/Seasons.js";
import { SeasonDetail } from "./screens/SeasonDetail.js";
import { EditHistory } from "./screens/EditHistory.js";
import { WhoAmI } from "./screens/WhoAmI.js";
import { More } from "./screens/More.js";
import { PokerGuide } from "./screens/PokerGuide.js";
import { HallOfFame } from "./screens/HallOfFame.js";
import { ChipCalculator } from "./screens/ChipCalculator.js";
import { isAdminDevice } from "./storage/localKeys.js";

// Admin code (auth, write path, admin screens) is a separate chunk that viewers never download.
const loadAdmin = () => import("./admin/AdminRoutes.js");
const AdminRoutes = lazy(() =>
  loadAdmin()
    .then((m) => {
      reloader.clear(); // loaded fine: the next deploy may auto-reload once again
      return { default: m.AdminRoutes };
    })
    .catch((err: unknown) => {
      // A stale page asking for a chunk a newer deploy deleted: reload once into the new version and keep
      // showing the loading text meanwhile. If that already happened, the router's error screen shows.
      if (reloader.reloadOnce()) return new Promise<never>(() => {});
      throw err;
    }),
);

// Dev-only style guide (#/style). The DEV check is a compile-time constant, so production builds drop
// the route and the chunk entirely; check-bundle verifies it.
const StylePreview = import.meta.env.DEV
  ? lazy(() => import("./style/StylePreview.js").then((m) => ({ default: m.StylePreview })))
  : null;

// Every screen transition passes this guard (never on live/end screens or with motion off). Installed
// before the router exists so its popstate listener runs before React Router's (back = back slide).
installViewTransitionGuard(window);

const router = createHashRouter([
  ...(StylePreview
    ? [
        {
          path: "/style",
          element: (
            <Suspense fallback={null}>
              <StylePreview />
            </Suspense>
          ),
        },
      ]
    : []),
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        // Pathless layout route: screen errors render inside the shell (header, nav) instead of replacing it.
        errorElement: <RouteError />,
        children: [
          { path: "/", element: <Leaderboard /> },
          { path: "/games", element: <GameHistory /> },
          { path: "/games/:id", element: <GameDetail /> },
          { path: "/players/:id", element: <PlayerPage /> },
          { path: "/seasons", element: <Seasons /> },
          { path: "/seasons/:id", element: <SeasonDetail /> },
          { path: "/history", element: <EditHistory /> },
          { path: "/me", element: <WhoAmI /> },
          { path: "/more", element: <More /> },
          { path: "/guide", element: <PokerGuide /> },
          { path: "/hall", element: <HallOfFame /> },
          { path: "/chips", element: <ChipCalculator /> },
          {
            path: "/admin/*",
            element: (
              <Suspense fallback={<p className="p-4">Loading admin…</p>}>
                <AdminRoutes />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
]);

export function App() {
  // On the phone that runs games only: fetch the admin chunk once while online so the service worker's
  // runtime cache has the current version for an offline game, even right after an app update.
  useEffect(() => {
    if (isAdminDevice() && navigator.onLine) void loadAdmin().catch(() => {});
  }, []);

  return (
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  );
}
