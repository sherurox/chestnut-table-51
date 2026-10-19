import { describe, expect, it } from "vitest";
import {
  ITERATIONS,
  decryptToken,
  encryptToken,
  expiryDateError,
  passphraseError,
} from "../../scripts/encrypt-token.mjs";
import { AdminNotSetUpError, WrongPasswordError, decryptAdminKey, parseAdminKey } from "./adminKey.js";

// Obviously fake: never a real token in tests.
const FAKE_TOKEN = "fake-token-for-tests-0123456789";
const PASSPHRASE = "correct horse battery staple";

describe("encrypt-token.mjs ↔ app decrypt", () => {
  it("writes the §7.2 blob shape with 600k iterations, 16-byte salt, 12-byte iv", async () => {
    const blob = await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01");
    expect(Object.keys(blob).sort()).toEqual(
      ["ciphertext", "iterations", "iv", "kdf", "salt", "tokenExpiresOn", "v"].sort(),
    );
    expect(blob).toMatchObject({ v: 1, kdf: "PBKDF2-SHA256", iterations: 600_000, tokenExpiresOn: "2027-10-01" });
    expect(ITERATIONS).toBe(600_000);
    expect(atob(blob.salt)).toHaveLength(16);
    expect(atob(blob.iv)).toHaveLength(12);
    expect(JSON.stringify(blob)).not.toContain(FAKE_TOKEN);
  });

  it("the app decrypts what the script encrypted, with the right password", async () => {
    const blob = parseAdminKey(await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01"));
    await expect(decryptAdminKey(blob, PASSPHRASE)).resolves.toBe(FAKE_TOKEN);
    await expect(decryptToken(blob, PASSPHRASE)).resolves.toBe(FAKE_TOKEN);
  });

  it("trims the passphrase on both sides", async () => {
    const blob = parseAdminKey(await encryptToken(FAKE_TOKEN, `${PASSPHRASE} `, "2027-10-01"));
    await expect(decryptAdminKey(blob, ` ${PASSPHRASE}`)).resolves.toBe(FAKE_TOKEN);
  });

  it("a wrong password fails with WrongPasswordError, without leaking the token", async () => {
    const blob = parseAdminKey(await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01"));
    const err = await decryptAdminKey(blob, "wrong horse battery staple").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WrongPasswordError);
    expect((err as Error).message).toBe("Wrong password");
    expect(String(err)).not.toContain(FAKE_TOKEN);
  });

  it("uses a fresh salt and iv each run", async () => {
    const a = await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01");
    const b = await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01");
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });
});

describe("encrypt-token.mjs input rules", () => {
  it("refuses passphrases shorter than 16 characters (after trimming)", async () => {
    expect(passphraseError("fifteen chars!!")).toMatch(/at least 16/);
    expect(passphraseError("   short   words   ".trim())).toMatch(/at least 16/);
    expect(passphraseError("sixteen chars!!!")).toBeNull();
    await expect(encryptToken(FAKE_TOKEN, "too short", "2027-10-01")).rejects.toThrow(/at least 16/);
  });

  it("validates the expiry date", () => {
    const today = new Date(2026, 9, 19);
    expect(expiryDateError("2026-10-20", today)).toBeNull();
    expect(expiryDateError("2026-10-19", today)).toMatch(/future/);
    expect(expiryDateError("2026-02-30", today)).toMatch(/real date/);
    expect(expiryDateError("20-10-2026", today)).toMatch(/YYYY-MM-DD/);
  });
});

describe("parseAdminKey", () => {
  it("rejects missing, malformed or extra-keyed files as 'not set up'", async () => {
    const good = await encryptToken(FAKE_TOKEN, PASSPHRASE, "2027-10-01");
    const bad: unknown[] = [
      null,
      "<!doctype html>",
      {},
      { ...good, v: 2 },
      { ...good, salt: "c2hvcnQ=" },
      { ...good, iv: "not base64!!" },
      { ...good, ciphertext: "" },
      { ...good, tokenExpiresOn: "soon" },
      { ...good, token: "extra field" },
    ];
    for (const raw of bad) {
      expect(() => parseAdminKey(raw)).toThrow(AdminNotSetUpError);
    }
    expect(() => parseAdminKey(good)).not.toThrow();
  });
});
