// Dev-only sandbox mode (CLAUDE.md §8.6): with SANDBOX=1 the dev server keeps a copy of the data in
// data/sandbox.json and serves it at /__sandbox__/* (src/devserver/sandboxServer.ts). Every caller guards
// with `import.meta.env.DEV && __CT51_SANDBOX__`, so none of this reaches production (check:bundle).
// These requests never carry the admin token: the sandbox token is a dummy and must never be sent anywhere.

export const SANDBOX_BASE = "/__sandbox__";
export const SANDBOX_DATA_URL = `${SANDBOX_BASE}/data`;
export const SANDBOX_HISTORY_URL = `${SANDBOX_BASE}/history`;
export const SANDBOX_ADMIN_KEY_URL = `${SANDBOX_BASE}/admin-key`;
// Set on every sandbox page load. A normal dev server that finds it refuses to sync this browser's queue
// to GitHub (it may hold sandbox games).
export const SANDBOX_DEVICE_KEY = "ct51.sandboxDevice";
export const SANDBOX_BANNER_TEXT = "SANDBOX — not real data";

export interface SandboxFile {
  sha: string;
  content: string; // data/sandbox.json as text
}

export interface SandboxCommit {
  sha: string;
  message: string;
  date: string;
}

export async function sandboxGetData(fetchFn: typeof fetch): Promise<SandboxFile> {
  const res = await fetchFn(SANDBOX_DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sandbox data endpoint returned ${res.status}`);
  return (await res.json()) as SandboxFile;
}

export function sandboxPutData(fetchFn: typeof fetch, body: { sha: string; content: string; message: string }): Promise<Response> {
  return fetchFn(SANDBOX_DATA_URL, {
    method: "PUT",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sandboxHistory(fetchFn: typeof fetch): Promise<SandboxCommit[]> {
  const res = await fetchFn(SANDBOX_HISTORY_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load edit history (${res.status}).`);
  return (await res.json()) as SandboxCommit[];
}

export function markSandboxDevice(): void {
  try {
    localStorage.setItem(SANDBOX_DEVICE_KEY, "1");
  } catch {
    // best effort
  }
}
