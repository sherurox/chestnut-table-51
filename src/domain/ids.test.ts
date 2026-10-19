import { describe, expect, it } from "vitest";
import { newId } from "./ids.js";

describe("newId", () => {
  it("returns 8 url-safe characters", () => {
    expect(newId()).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  it("maps bytes deterministically with an injected source", () => {
    expect(newId((b) => b.fill(0))).toBe("AAAAAAAA");
    expect(newId((b) => b.fill(255))).toBe("--------");
  });

  it("does not repeat across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
