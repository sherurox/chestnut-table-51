export function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatSignedDollars(amount: number): string {
  if (amount === 0) return "$0";
  const sign = amount > 0 ? "+" : "−";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US")}`;
}

// A game date ("2026-10-19", or one with a time after it) as that calendar day at local midnight.
// Never `new Date("2026-10-19")`: that is UTC midnight, which is the day before in US time zones.
// Every game date shown or charted goes through here. null if it doesn't start with a valid date.
export function calendarDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

// Game date for screens: "2026-10-19" → "Mon, Oct 19".
export function formatDate(isoDate: string): string {
  const d = calendarDate(isoDate);
  if (!d) return isoDate;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatLastUpdated(lastUpdated: string | null): string {
  if (lastUpdated === null) return "unknown";
  if (lastUpdated === "just now (dev)") return lastUpdated;
  return formatDateTime(lastUpdated);
}
