import type { ReactNode } from "react";
import { daysUntilExpiry } from "../domain/dates.js";

const WARN_DAYS = 14;

// CLAUDE.md §7.3: warn when the token expires within 14 days; block admin screens once it has expired.
export function ExpiryGate({ expiresOn, children }: { expiresOn: string | null; children: ReactNode }) {
  const days = expiresOn ? daysUntilExpiry(expiresOn) : null;

  if (days !== null && days < 0) {
    return (
      <div role="alert" className="m-4 rounded-lg border border-loss p-4">
        <p className="font-semibold">Admin key has expired.</p>
        <p className="mt-1 text-sm">The owner needs to create a new token and rerun the setup script.</p>
      </div>
    );
  }

  return (
    <>
      {days !== null && days <= WARN_DAYS && (
        <p role="status" className="mx-4 mt-2 ct-panel ct-panel-brass px-3 py-2 text-sm">
          {days === 0 ? "Admin key expires today." : `Admin key expires in ${days} day${days === 1 ? "" : "s"}.`}
        </p>
      )}
      {children}
    </>
  );
}
