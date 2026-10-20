import { useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getTokenExpiresOn } from "../storage/auth.js";
import { ADMIN_DEVICE_KEY, browserStore } from "../storage/localKeys.js";
import { AdminHome } from "./AdminHome.js";
import { DeletedGames } from "./DeletedGames.js";
import { EditGame } from "./EditGame.js";
import { EndGame } from "./EndGame.js";
import { ExpiryGate } from "./ExpiryGate.js";
import { needsLogin, NO_LOGIN_PATHS } from "./gate.js";
import { LiveGame } from "./LiveGame.js";
import { useLocalGame } from "./localHooks.js";
import { Login } from "./Login.js";
import { Players } from "./Players.js";
import { Seasons } from "./Seasons.js";
import { Settings } from "./Settings.js";
import { StartGame } from "./StartGame.js";
import { SyncProvider } from "./sync.js";
import { useLoggedIn } from "./ui.js";

function BackToGame() {
  return (
    <Link to="/admin/live" className="ct-btn ct-btn-primary mx-4 mt-2 flex">
      Game in progress — back to the game
    </Link>
  );
}

function AdminScreens() {
  const loggedIn = useLoggedIn();
  const local = useLocalGame();
  const { pathname } = useLocation();
  const inGame = NO_LOGIN_PATHS.includes(pathname);

  useEffect(() => {
    if (!loggedIn) return;
    try {
      browserStore()?.setItem(ADMIN_DEVICE_KEY, "1"); // keeps admin code cached for offline games
    } catch {
      // best effort
    }
  }, [loggedIn]);

  if (needsLogin(loggedIn, local !== null, pathname)) {
    // Keyed by route so a stale "Wrong password" doesn't follow the admin to another admin page.
    return <Login key={pathname} />;
  }

  return (
    <ExpiryGate expiresOn={getTokenExpiresOn()}>
      {/* Admin home has its own "Resume game" button; the banner is for the other admin pages. */}
      {local && !inGame && pathname !== "/admin" && <BackToGame />}
      <Routes>
        <Route index element={<AdminHome />} />
        <Route path="start" element={<StartGame />} />
        <Route path="live" element={<LiveGame />} />
        <Route path="end" element={<EndGame />} />
        <Route path="players" element={<Players />} />
        <Route path="seasons" element={<Seasons />} />
        <Route path="settings" element={<Settings />} />
        <Route path="games/:id/edit" element={<EditGame />} />
        <Route path="deleted" element={<DeletedGames />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </ExpiryGate>
  );
}

// Everything under #/admin/*. Loaded lazily from App.tsx so viewers never download admin code.
export function AdminRoutes() {
  return (
    <SyncProvider>
      <AdminScreens />
    </SyncProvider>
  );
}
