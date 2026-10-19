import { validateData } from "./schema.js";
import type { Data } from "./types.js";

export function migrate(raw: unknown): Data {
  const candidate = raw as { version?: unknown };
  if (candidate?.version !== 1) {
    throw new Error(`Unsupported data version: ${String(candidate?.version)}`);
  }
  return validateData(raw);
}
