import { useEffect, useState, type FormEvent } from "react";
import { useData } from "../state/DataContext.js";
import { AdminNotSetUpError, NOT_SET_UP_MESSAGE } from "../storage/adminKey.js";
import { fetchAdminKey, login } from "../storage/auth.js";
import { btnPrimary, input, muted } from "./ui.js";

export function Login() {
  const { refresh } = useData();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);

  // Check up front so a missing key file says so instead of asking for a password first.
  useEffect(() => {
    fetchAdminKey().catch((err: unknown) => {
      if (err instanceof AdminNotSetUpError) setNotSetUp(true);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      setPassword("");
      refresh(); // reload from the authenticated GitHub API (CLAUDE.md §8.1)
    } catch (err) {
      if (err instanceof AdminNotSetUpError) setNotSetUp(true);
      else setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  if (notSetUp) {
    return (
      <div className="p-4">
        <h1 className="mb-3 text-lg font-semibold">Admin</h1>
        <p>{NOT_SET_UP_MESSAGE}</p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit}>
      <h1 className="text-lg font-semibold">Admin login</h1>
      <p className={`text-sm ${muted}`}>Viewers don't need this. Reloading the page logs you out.</p>
      {/* Lets password managers file the passphrase under a stable name. */}
      <input type="text" name="username" autoComplete="username" value="CT51 admin" readOnly hidden />
      <label className="flex flex-col gap-1">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" className={btnPrimary} disabled={busy || password.length === 0}>
        {busy ? "Unlocking…" : "Unlock"}
      </button>
      <p role="alert" className="min-h-[1.5rem] text-sm text-loss">
        {error}
      </p>
    </form>
  );
}
