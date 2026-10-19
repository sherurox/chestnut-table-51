import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";

function Placeholder({ label }: { label: string }) {
  return <div className="p-4">{label}</div>;
}

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Placeholder label="Leaderboard" /> },
      { path: "/games", element: <Placeholder label="Game history" /> },
      { path: "/games/:id", element: <Placeholder label="Game detail" /> },
      { path: "/players/:id", element: <Placeholder label="Player page" /> },
      { path: "/seasons", element: <Placeholder label="Seasons" /> },
      { path: "/seasons/:id", element: <Placeholder label="Season detail" /> },
      { path: "/history", element: <Placeholder label="Edit history" /> },
      { path: "/me", element: <Placeholder label="Who are you?" /> },
      { path: "/more", element: <Placeholder label="More" /> },
      { path: "/admin", element: <Placeholder label="Admin — coming soon" /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
