import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
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
import { Admin } from "./screens/Admin.js";

const router = createHashRouter([
  {
    element: <AppShell />,
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
      { path: "/admin", element: <Admin /> },
    ],
  },
]);

export function App() {
  return (
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  );
}
