import { z } from "zod";

// Parsing and decryption of public/admin-key.json (CLAUDE.md §7.2). Pure crypto, no network: auth.ts
// fetches the file. Must stay compatible with scripts/encrypt-token.mjs (cross-checked in adminKey.test.ts).

export const NOT_SET_UP_MESSAGE = "Admin not set up yet. The owner needs to run the setup script.";

export class AdminNotSetUpError extends Error {
  constructor() {
    super(NOT_SET_UP_MESSAGE);
    this.name = "AdminNotSetUpError";
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong password");
    this.name = "WrongPasswordError";
  }
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodedLength(text: string): number {
  try {
    return fromBase64(text).length;
  } catch {
    return -1;
  }
}

const base64OfLength = (bytes: number) => z.string().refine((s) => decodedLength(s) === bytes);

const adminKeySchema = z
  .object({
    v: z.literal(1),
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.number().int().positive(),
    salt: base64OfLength(16),
    iv: base64OfLength(12),
    // AES-GCM output is the plaintext plus a 16-byte auth tag.
    ciphertext: z.string().refine((s) => decodedLength(s) > 16),
    tokenExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export type AdminKeyBlob = z.infer<typeof adminKeySchema>;

// Throws AdminNotSetUpError for anything that isn't a well-formed key file.
export function parseAdminKey(raw: unknown): AdminKeyBlob {
  const result = adminKeySchema.safeParse(raw);
  if (!result.success) throw new AdminNotSetUpError();
  return result.data;
}

// The passphrase is trimmed, matching the setup script (phone keyboards add trailing spaces).
export async function decryptAdminKey(blob: AdminKeyBlob, password: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.trim()), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(blob.salt), iterations: blob.iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(blob.iv) }, key, fromBase64(blob.ciphertext));
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
