// Home's install hint (CLAUDE.md §11). iOS Safari has no install prompt, so it gets instructions; Android
// Chrome gets an "Install app" button, but only once the browser has offered its install prompt
// (beforeinstallprompt). Nothing when already installed, or once dismissed on this phone.

export const INSTALL_HINT_DISMISSED_KEY = "ct51.installHintDismissed";

export type InstallHint = "ios" | "android" | null;

// Other iOS browsers (Chrome, Firefox, Edge, Opera, the Google app) don't show Safari's Share sheet steps.
export function isIosSafari(userAgent: string, ios: boolean): boolean {
  return ios && /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
}

export function installHint(input: {
  iosSafari: boolean;
  standalone: boolean;
  dismissed: boolean;
  canPrompt: boolean; // a deferred beforeinstallprompt event is available
}): InstallHint {
  if (input.standalone || input.dismissed) return null;
  if (input.iosSafari) return "ios";
  if (input.canPrompt) return "android";
  return null;
}
