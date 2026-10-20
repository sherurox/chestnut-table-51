import { useRouteError } from "react-router-dom";
import { ChipBadge } from "../design/components.js";
import { SandboxBanner } from "./SandboxBanner.js";
import { isChunkLoadError, reloadIntoNewVersion, reloader } from "../lib/appUpdate.js";

// Router errorElement: a friendly screen instead of React Router's developer error page.
export function RouteError() {
  const error = useRouteError();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const chunk = isChunkLoadError(error);

  const title = offline
    ? "You're offline and this part of the app isn't cached yet."
    : chunk
      ? "CT51 was updated — tap to reload"
      : "Something went wrong.";
  const detail = offline
    ? "Reconnect, then reload. A game in progress is still saved on this phone."
    : chunk
      ? "A newer version is available. Your data and any game in progress are saved on this phone."
      : "Reloading usually fixes it. Any game in progress is saved on this phone.";

  return (
    <div role="alert" className="ct-app p-4">
      <SandboxBanner />
      <div className="ct-panel ct-panel-brass mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-8 text-center">
        <ChipBadge size={64} />
        <h1 className="ct-display text-xl font-semibold">{title}</h1>
        <p className="text-sm text-ink-muted">{detail}</p>
        <button
          type="button"
          className="ct-btn ct-btn-primary w-full"
          onClick={() => {
            reloader.clear();
            void reloadIntoNewVersion();
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
