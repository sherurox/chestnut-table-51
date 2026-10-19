import { ChipBadge, EmptyState } from "../design/components.js";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useData } from "../state/DataContext.js";
import { AdminNotSetUpError, NOT_SET_UP_MESSAGE } from "../storage/adminKey.js";
import { fetchAdminKey, login } from "../storage/auth.js";
import { canDecryptHere, INSECURE_CONTEXT_MESSAGE } from "./gate.js";
import { useLocalGame, useQueue } from "./localHooks.js";
import { btnPrimary, btnSecondary, input, muted } from "./ui.js";

// Shown above the login form on the phone that runs games (§9.6).
function LocalGameNotice() {
  const local = useLocalGame();
  const queued = useQueue().length;
  if (!local && queued === 0) return null;
  return (
    <div className="flex flex-col gap-2 ct-panel ct-panel-brass p-3">
      {local && (
        <Link to="/admin/live" className={`${btnSecondary} flex items-center justify-center font-semibold`}>
          Continue the game on this phone
        </Link>
      )}
      {queued > 0 && (
        <p className="text-sm">
          {queued} game{queued === 1 ? "" : "s"} not synced. Log in (needs internet) to sync.
        </p>
      )}
    </div>
  );
}

export function Login() {
  const { refresh } = useData();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const secure = canDecryptHere(window);

  // Check up front so a missing key file says so instead of asking for a password first.
  useEffect(() => {
    fetchAdminKey().catch((err: unknown) => {
      if (err instanceof AdminNotSetUpError) setNotSetUp(true);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canDecryptHere(window)) return setError(INSECURE_CONTEXT_MESSAGE);
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
        <EmptyState suit="♠" title="Admin">
          {NOT_SET_UP_MESSAGE}
        </EmptyState>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4 px-4 pt-6 pb-4" onSubmit={onSubmit}>
      <div className="flex flex-col items-center gap-2 text-center">
        <ChipBadge size={72} />
        <h1 className="ct-display text-2xl font-semibold">Admin login</h1>
        <p className={`text-sm ${muted}`}>Viewers don't need this. Reloading the page logs you out.</p>
      </div>
      <LocalGameNotice />
      {/* Lets password managers file the passphrase under a stable name. */}
      <input type="text" name="username" autoComplete="username" value="CT51 admin" readOnly hidden />
      <label className="flex flex-col">
        <span className="ct-label">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" className={btnPrimary} disabled={busy || !secure || password.length === 0}>
        {busy ? "Unlocking…" : "Unlock"}
      </button>
      <p role="alert" className="min-h-[1.5rem] text-sm text-loss">
        {secure ? error : INSECURE_CONTEXT_MESSAGE}
      </p>
    </form>
  );
}
