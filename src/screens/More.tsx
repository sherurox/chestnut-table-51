import { Link } from "react-router-dom";
import { PageTitle, Wordmark } from "../design/components.js";
import { IconChevron } from "../design/icons.js";
import { currentMotionEnv, setMotionSetting, useMotionReduced, useMotionSetting } from "../design/motion.js";
import { useTheme } from "../state/useTheme.js";

export function More() {
  const { theme, toggle } = useTheme();
  const animations = useMotionSetting();
  useMotionReduced(); // re-render when the phone's reduced-motion setting changes
  const osReduced = currentMotionEnv().osReduced;

  return (
    <div className="px-4 pt-2 pb-4">
      <PageTitle suit="♥" title="More" />
      <div className="ct-panel overflow-hidden">
        <ul>
          <li>
            <Link to="/guide" className="ct-list-row ct-focus">
              <span className="flex-1">Poker Guide</span>
              <span className="text-ink-muted">
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/hall" className="ct-list-row ct-focus">
              <span className="flex-1">Hall of Fame</span>
              <span className="text-ink-muted">
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/history" className="ct-list-row ct-focus">
              <span className="flex-1">Edit history</span>
              <span className="text-ink-muted">
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <Link to="/me" className="ct-list-row ct-focus">
              <span className="flex-1">Who are you?</span>
              <span className="text-ink-muted">
                <IconChevron />
              </span>
            </Link>
          </li>
          <li>
            <button type="button" onClick={toggle} className="ct-list-row w-full text-left" aria-label={`Theme: ${theme}. Switch theme`}>
              <span className="flex-1">Theme</span>
              <span className="ct-tag ct-tag-brass">{theme === "dark" ? "☾ Dark" : "☀ Light"}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              role="switch"
              aria-checked={animations}
              onClick={() => setMotionSetting(!animations)}
              className="ct-list-row ct-focus w-full text-left"
            >
              <span className="flex-1">
                Animations
                {osReduced && <span className="block text-xs text-ink-muted">Off: your phone asks for reduced motion</span>}
              </span>
              <span className="ct-tag ct-tag-brass">{animations ? "On" : "Off"}</span>
            </button>
          </li>
          <li>
            <Link to="/admin" className="ct-list-row ct-focus">
              <span className="flex-1">Admin</span>
              <span className="text-ink-muted">
                <IconChevron />
              </span>
            </Link>
          </li>
        </ul>
      </div>
      <div className="mt-10 flex flex-col items-center gap-2 text-center">
        <Wordmark size="lg" />
        <p lang="hi" className="text-sm break-words">💰 या तो लाखों में या सलाखों में💰</p>
      </div>
    </div>
  );
}
