// Types for the test import of encrypt-token.mjs (the script itself stays plain JS so Node runs it directly).
export interface AdminKeyBlobOut {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  tokenExpiresOn: string;
}

export const ITERATIONS: number;
export const MIN_PASSPHRASE_LENGTH: number;
export function passphraseError(passphrase: string): string | null;
export function expiryDateError(text: string, today?: Date): string | null;
export function encryptToken(token: string, passphrase: string, tokenExpiresOn: string): Promise<AdminKeyBlobOut>;
export function decryptToken(blob: AdminKeyBlobOut, passphrase: string): Promise<string>;
