const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

// 8 chars from a 64-char alphabet (~48 bits). 256 is a multiple of 64, so `byte & 63` is unbiased.
// Collisions are still caught by schema validation before any write.
export function newId(fillRandom: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = fillRandom(new Uint8Array(8));
  let id = "";
  for (const b of bytes) id += ALPHABET[b & 63];
  return id;
}
