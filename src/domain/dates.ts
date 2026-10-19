const DAY_MS = 86_400_000;

// Today's date as YYYY-MM-DD in the device's local time zone (not UTC: a game played at 11pm is "today").
export function localIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whole calendar days from `today` (local) until `expiresOn` (YYYY-MM-DD). 0 = expires today,
// negative = already expired. Returns null if `expiresOn` isn't a valid YYYY-MM-DD date.
export function daysUntilExpiry(expiresOn: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiresOn);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const expiry = Date.UTC(y, m - 1, d);
  const check = new Date(expiry);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry - todayUtc) / DAY_MS);
}
