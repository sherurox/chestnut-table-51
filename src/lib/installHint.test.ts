import { describe, expect, it } from "vitest";
import { installHint, isIosSafari } from "./installHint.js";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const IOS_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const base = { iosSafari: false, standalone: false, dismissed: false, canPrompt: false };

describe("isIosSafari", () => {
  it("is Safari on iOS only, not other iOS browsers or Android", () => {
    expect(isIosSafari(IOS_SAFARI, true)).toBe(true);
    expect(isIosSafari(IOS_CHROME, true)).toBe(false);
    expect(isIosSafari(IOS_FIREFOX, true)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, false)).toBe(false);
  });
});

describe("installHint", () => {
  it("iOS Safari, not installed: the Share → Add to Home Screen card", () => {
    expect(installHint({ ...base, iosSafari: true })).toBe("ios");
  });

  it("Android Chrome: the Install button only once the browser offered its prompt", () => {
    expect(installHint({ ...base, canPrompt: true })).toBe("android");
    expect(installHint(base)).toBeNull();
  });

  it("hidden when already installed (running standalone)", () => {
    expect(installHint({ ...base, iosSafari: true, standalone: true })).toBeNull();
    expect(installHint({ ...base, canPrompt: true, standalone: true })).toBeNull();
  });

  it("hidden once dismissed", () => {
    expect(installHint({ ...base, iosSafari: true, dismissed: true })).toBeNull();
    expect(installHint({ ...base, canPrompt: true, dismissed: true })).toBeNull();
  });
});
