// A game already running on this phone can be continued after a reload without logging in (§9.6):
// buy-ins, undo, final stacks, chip check and Save into the "Not synced" queue. Syncing needs login.
export const NO_LOGIN_PATHS = ["/admin/live", "/admin/end"];

// The login gate renders in place of the admin screen at the same URL (route and query untouched), so
// after unlocking, the requested screen opens as asked, e.g. Start with `?mode=incognito` still set.
export function needsLogin(loggedIn: boolean, hasLocalGame: boolean, pathname: string): boolean {
  return !loggedIn && !(hasLocalGame && NO_LOGIN_PATHS.includes(pathname));
}
