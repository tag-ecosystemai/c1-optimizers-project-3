// The only place money, days and dates get formatted (spec §9). Dates are treated as UTC calendar days,
// so "2017-03-18" reads "Mar 18, 2017" in every timezone.

const DAY_MS = 86_400_000;

const toDate = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d);

/** `$1,180.50`; whole amounts drop the cents (`$340`). `compact` gives `$1.2K`; `decimals: 3` gives `$0.031` for tiny costs. */
export function usd(n: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (opts.compact) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  }
  const cents = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents, maximumFractionDigits: cents });
}

/** `4.2 days`, `1 day`; `sign` adds a leading `+` to positive values. */
export function days(n: number, opts: { sign?: boolean } = {}): string {
  const text = n === 1 ? "1 day" : `${n.toFixed(1)} days`;
  return opts.sign && n > 0 ? `+${text}` : text;
}

/** `Mar 18, 2017`. Accepts `YYYY-MM-DD` or an ISO timestamp. */
export function date(d: string): string {
  return toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** `Mar 18, 2017, 06:00 UTC`, for activity logs. */
export function dateTime(d: string): string {
  const t = toDate(d);
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date(d)}, ${time} UTC`;
}

/** `72%` from 0.72. */
export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** `1,240`; `digits` fixes the decimals (`num(0.8123, 2)` → `0.81`). */
export function num(n: number, digits?: number): string {
  return n.toLocaleString("en-US", digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

/** `YYYY-MM-DD` plus n days. */
export function addDays(d: string, n: number): string {
  return new Date(toDate(d).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** `today`, `tomorrow`, `in 12 days`, `yesterday`, `5 days ago`, relative to the data's as-of date (never the browser clock). */
export function relativeToAsOf(d: string, asOf: string): string {
  const n = daysBetween(asOf, d.slice(0, 10));
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
