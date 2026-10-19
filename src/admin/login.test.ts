import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canDecryptHere, INSECURE_CONTEXT_MESSAGE } from "./gate.js";
import { Login } from "./Login.js";

vi.mock("../state/DataContext.js", () => ({ useData: () => ({ refresh: () => {} }) }));
vi.mock("./localHooks.js", () => ({ useLocalGame: () => null, useQueue: () => [] }));

afterEach(() => vi.unstubAllGlobals());

const render = () => renderToString(createElement(MemoryRouter, null, createElement(Login)));

describe("admin login needs a secure context", () => {
  it("only https/localhost with Web Crypto can decrypt the admin key", () => {
    expect(canDecryptHere({ isSecureContext: true, crypto: { subtle: {} } })).toBe(true);
    expect(canDecryptHere({ isSecureContext: false, crypto: { subtle: {} } })).toBe(false);
    expect(canDecryptHere({ isSecureContext: true, crypto: {} })).toBe(false);
    expect(canDecryptHere({ isSecureContext: false, crypto: {} })).toBe(false);
    expect(canDecryptHere({})).toBe(false);
  });

  it("on plain http (e.g. a LAN IP) the login screen says so, not 'Wrong password', and can't submit", () => {
    vi.stubGlobal("window", { isSecureContext: false, crypto: {} });
    const html = render();
    expect(html).toContain(INSECURE_CONTEXT_MESSAGE);
    expect(html).not.toContain("Wrong password");
    expect(html).toMatch(/<button type="submit"[^>]*disabled/);
  });

  it("on https the login screen shows no such message", () => {
    vi.stubGlobal("window", { isSecureContext: true, crypto: { subtle: {} } });
    expect(render()).not.toContain("secure (https) connection");
  });
});
