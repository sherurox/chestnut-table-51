import { createHash, randomBytes } from "node:crypto";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { encryptToken } from "../../scripts/encrypt-token.mjs";

// Dev-server side of sandbox mode (CLAUDE.md §8.6). Node only: imported by vite.config.ts, never by app
// code. Serves data/sandbox.json at /__sandbox__/* and accepts writes like the GitHub contents API would:
// a stale sha gets 409, data that fails `validate` (the app's own migrate + zod schema) gets 422 and is
// never written. data/data.json is only ever read, once, to seed the sandbox.

// Not a GitHub token (it has no GitHub token prefix). check:bundle fails if it ever appears in dist/.
export const SANDBOX_DUMMY_TOKEN = "ct51-sandbox-dummy-token-NOT-A-GITHUB-TOKEN";

export interface SandboxPaths {
  source: string; // data/data.json (read-only seed)
  data: string;
  history: string;
  adminKey: string;
  passphrase: string;
}

export function sandboxPaths(dataDir: string): SandboxPaths {
  return {
    source: join(dataDir, "data.json"),
    data: join(dataDir, "sandbox.json"),
    history: join(dataDir, "sandbox-history.json"),
    adminKey: join(dataDir, "sandbox-admin-key.json"),
    passphrase: join(dataDir, "sandbox-admin-pass.txt"),
  };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export const shaOf = (text: string) => createHash("sha1").update(text).digest("hex");

function isoDatePlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// Seeds the sandbox from data.json and creates the throwaway admin key the first time. Never prints the
// passphrase; it is only in data/sandbox-admin-pass.txt (gitignored).
export async function ensureSandbox(paths: SandboxPaths): Promise<{ seeded: boolean; keyCreated: boolean }> {
  const seeded = !(await exists(paths.data));
  if (seeded) {
    await copyFile(paths.source, paths.data);
    await writeFile(paths.history, "[]\n");
  }
  const keyCreated = !(await exists(paths.adminKey)) || !(await exists(paths.passphrase));
  if (keyCreated) {
    const passphrase = randomBytes(18).toString("base64url"); // 24 characters
    const blob = await encryptToken(SANDBOX_DUMMY_TOKEN, passphrase, isoDatePlusDays(365));
    await writeFile(paths.passphrase, `${passphrase}\n`);
    await writeFile(paths.adminKey, `${JSON.stringify(blob, null, 2)}\n`);
  }
  return { seeded, keyCreated };
}

interface HistoryEntry {
  sha: string;
  message: string;
  date: string;
}

async function readHistory(paths: SandboxPaths): Promise<HistoryEntry[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(paths.history, "utf-8"));
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export interface SandboxResponse {
  status: number;
  body: unknown;
  contentType?: string;
}

export interface SandboxStore {
  handle(method: string, path: string, body: string): Promise<SandboxResponse>;
}

// `allowPassphrase`: only the localhost-only review server (DEV_HTTP=1) serves the test passphrase.
export function createSandboxStore(opts: {
  paths: SandboxPaths;
  validate: (raw: unknown) => unknown | Promise<unknown>;
  allowPassphrase: boolean;
  now?: () => Date;
}): SandboxStore {
  const { paths, validate } = opts;
  const now = opts.now ?? (() => new Date());
  let queue: Promise<unknown> = Promise.resolve();

  async function put(body: string): Promise<SandboxResponse> {
    let req: { sha?: unknown; content?: unknown; message?: unknown };
    try {
      req = JSON.parse(body) as typeof req;
    } catch {
      return { status: 400, body: { message: "Body isn't JSON" } };
    }
    if (typeof req.sha !== "string" || typeof req.content !== "string" || typeof req.message !== "string" || !req.message) {
      return { status: 422, body: { message: "sha, content and message are required" } };
    }
    const current = await readFile(paths.data, "utf-8");
    if (req.sha !== shaOf(current)) return { status: 409, body: { message: "sandbox.json does not match the sha" } };
    try {
      await validate(JSON.parse(req.content));
    } catch (err) {
      return { status: 422, body: { message: `Invalid data: ${err instanceof Error ? err.message : String(err)}` } };
    }
    await writeFile(paths.data, req.content);
    const sha = shaOf(req.content);
    const history = await readHistory(paths);
    await writeFile(paths.history, `${JSON.stringify([{ sha, message: req.message, date: now().toISOString() }, ...history], null, 2)}\n`);
    return { status: 200, body: { commit: { sha } } };
  }

  async function handle(method: string, path: string, body: string): Promise<SandboxResponse> {
    if (path === "/data" && method === "GET") {
      const content = await readFile(paths.data, "utf-8");
      return { status: 200, body: { sha: shaOf(content), content } };
    }
    if (path === "/data" && method === "PUT") {
      // One write at a time, so the sha check and the write can't interleave within this server.
      const result = queue.then(() => put(body));
      queue = result.catch(() => {});
      return result;
    }
    if (path === "/history" && method === "GET") return { status: 200, body: await readHistory(paths) };
    if (path === "/admin-key" && method === "GET") {
      return { status: 200, body: JSON.parse(await readFile(paths.adminKey, "utf-8")) };
    }
    if (path === "/test-passphrase" && method === "GET" && opts.allowPassphrase) {
      return { status: 200, body: (await readFile(paths.passphrase, "utf-8")).trim(), contentType: "text/plain; charset=utf-8" };
    }
    return { status: 404, body: { message: "Not found" } };
  }

  return { handle };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk: string) => (text += chunk));
    req.on("end", () => resolve(text));
    req.on("error", reject);
  });
}

// Connect middleware for Vite, mounted at /__sandbox__.
export function sandboxMiddleware(store: SandboxStore) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path = (req.url ?? "/").split("?")[0] ?? "/";
      const result = await store.handle(req.method ?? "GET", path, await readBody(req));
      res.statusCode = result.status;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", result.contentType ?? "application/json");
      res.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: String(err) }));
    }
  };
}
