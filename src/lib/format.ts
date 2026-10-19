export function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatSignedDollars(amount: number): string {
  if (amount === 0) return "$0";
  const sign = amount > 0 ? "+" : "−";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US")}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
