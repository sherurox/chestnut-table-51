import { Link } from "react-router-dom";
import { useTheme } from "../state/useTheme.js";

export function More() {
  const { theme, toggle } = useTheme();

  return (
    <div className="p-4">
      <h1 className="mb-3 text-lg font-semibold">More</h1>
      <ul className="divide-y divide-felt-700/20">
        <li>
          <Link to="/history" className="flex min-h-[48px] items-center">
            Edit history
          </Link>
        </li>
        <li>
          <Link to="/me" className="flex min-h-[48px] items-center">
            Who are you?
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={toggle}
            className="flex min-h-[48px] w-full items-center justify-between text-left"
          >
            <span>Theme</span>
            <span className="text-felt-950/60 dark:text-white/50">
              {theme === "dark" ? "Dark" : "Light"}
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}
