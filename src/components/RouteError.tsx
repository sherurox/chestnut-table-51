import { useRouteError } from "react-router-dom";
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
    <div role="alert" className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-felt-950/70 dark:text-white/70">{detail}</p>
      <button
        type="button"
        className="min-h-[48px] rounded-lg bg-chestnut-500 px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chestnut-400"
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
