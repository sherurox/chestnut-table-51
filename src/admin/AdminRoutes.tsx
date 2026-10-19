import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getTokenExpiresOn } from "../storage/auth.js";
import { AdminHome } from "./AdminHome.js";
import { ExpiryGate } from "./ExpiryGate.js";
import { Login } from "./Login.js";
import { Players } from "./Players.js";
import { Settings } from "./Settings.js";
import { useLoggedIn } from "./ui.js";

// Everything under #/admin/*. Loaded lazily from App.tsx so viewers never download admin code.
export function AdminRoutes() {
  const loggedIn = useLoggedIn();
  const { pathname } = useLocation();
  // Keyed by route so a stale "Wrong password" doesn't follow the admin to another admin page.
  if (!loggedIn) return <Login key={pathname} />;

  return (
    <ExpiryGate expiresOn={getTokenExpiresOn()}>
      <Routes>
        <Route index element={<AdminHome />} />
        <Route path="players" element={<Players />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </ExpiryGate>
  );
}
