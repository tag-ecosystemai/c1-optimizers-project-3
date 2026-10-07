import type { Cascade } from "@/types/api";
import { date, daysBetween, num } from "@/lib/format";

export type CoverInput = Pick<Cascade, "days_of_cover" | "stockout_date" | "projected_arrival"> & { units_short?: number };

const dayCount = (n: number) => (n === 1 ? "1 day" : `${n} days`);
const when = (n: number) => (n === 0 ? "today" : n > 0 ? `in ${dayCount(n)}` : `${dayCount(-n)} ago`);

function summary(cover: number, arrival: number, unitsShort?: number) {
  const out = cover <= 0 ? "Stock has run out" : `Stock runs out ${when(cover)}`;
  if (arrival <= cover) return `${out}; the order arrives ${when(arrival)}, ${dayCount(cover - arrival)} before that.`;
  const short = unitsShort ? `, ${num(unitsShort)} units short` : "";
  return `${out}; the order arrives ${when(arrival)}, a ${dayCount(arrival - cover)} gap${short}.`;
}

/** Triangle that points up at the arrival day. */
function ArrivalMarker({ late }: { late: boolean }) {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" className={late ? "text-risk-high" : "text-risk-low"}>
      <path d="M6 0 12 8H0Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The core visual (spec §4.4): stock burning down from the as-of date (day 0) to the stockout date, a
 * marker where the delayed shipment lands, and a red gap between them. Pass a cascade straight in.
 * @param asOfDate   "Today" from asOfDate(), never the browser clock.
 * @param cover      days_of_cover, stockout_date, projected_arrival, optional units_short (e.g. incident.cascade).
 * @param windowDays Days shown across the bar (default 30; grows to fit both dates).
 * @param compact    Bar only, no labels (for table rows). Still announced to screen readers.
 */
export function CoverBar({ asOfDate, cover, windowDays = 30, compact }: { asOfDate: string; cover: CoverInput; windowDays?: number; compact?: boolean }) {
  const coverDays = daysBetween(asOfDate, cover.stockout_date);
  const arrivalDays = daysBetween(asOfDate, cover.projected_arrival);
  const late = arrivalDays > coverDays;
  const gap = Math.max(arrivalDays - Math.max(coverDays, 0), 0);
  const win = Math.max(windowDays, arrivalDays + 2, coverDays + 2);
  const at = (d: number) => (Math.min(Math.max(d, 0), win) / win) * 100;
  const label = summary(coverDays, arrivalDays, cover.units_short);

  const bar = (
    <div role="img" aria-label={label} className={`relative w-full ${compact ? "h-4" : "h-6"}`}>
      {/* track */}
      <div className={`absolute inset-x-0 rounded-full bg-line-faint ${compact ? "top-1 h-2" : "top-1.5 h-3"}`}>
        {/* stock on hand */}
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r from-fg/80 to-fg/30" style={{ width: `${at(coverDays)}%` }} />
        {/* red gap: out of stock until the order lands */}
        {late && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(-45deg,var(--color-risk-high)_0_3px,#fca5a5_3px_6px)]"
            style={{ left: `${at(coverDays)}%`, width: `${at(arrivalDays) - at(coverDays)}%` }}
          />
        )}
      </div>
      {/* stockout marker */}
      <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-fg ring-2 ring-white" style={{ left: `${at(coverDays)}%` }} />
      {/* arrival marker */}
      <div className={`absolute -translate-x-1/2 ${compact ? "-bottom-1.5" : "-bottom-2"}`} style={{ left: `${at(arrivalDays)}%` }}>
        <ArrivalMarker late={late} />
      </div>
    </div>
  );

  if (compact) return <div className="min-w-24">{bar}</div>;

  const gapWide = late && at(arrivalDays) - at(coverDays) >= 16;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          Today <span className="text-fg-2">· {date(asOfDate)}</span>
        </span>
        <span>
          <span className="text-fg-2 tabular-nums">{dayCount(Math.max(cover.days_of_cover, 0))}</span> of stock on hand
        </span>
      </div>

      <div className="relative pt-4">
        {gapWide && (
          <span
            aria-hidden="true"
            className="absolute top-0 -translate-x-1/2 text-[11px] leading-none font-medium whitespace-nowrap text-risk-high"
            style={{ left: `${(at(coverDays) + at(arrivalDays)) / 2}%` }}
          >
            {gap}-day gap
          </span>
        )}
        {bar}
        <div aria-hidden="true" className="mt-2.5 flex justify-between text-[11px] leading-none text-muted tabular-nums">
          <span>Day 0</span>
          <span>Day {win}</span>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-fg" />
          <dt className="text-muted">{coverDays <= 0 ? "Ran out" : "Runs out"}</dt>
          <dd className="text-fg-2 tabular-nums">
            {date(cover.stockout_date)} <span className="text-muted">({when(coverDays)})</span>
          </dd>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <ArrivalMarker late={late} />
          <dt className="text-muted">Order arrives</dt>
          <dd className="text-fg-2 tabular-nums">
            {date(cover.projected_arrival)} <span className="text-muted">({when(arrivalDays)})</span>
          </dd>
        </div>
        <div className="flex w-full items-center gap-1.5">
          <dt className="sr-only">Outcome</dt>
          {late ? (
            <dd className="font-medium text-risk-high">
              <span aria-hidden="true">⚠ </span>
              {dayCount(gap)} with no stock
              {cover.units_short ? ` · ${num(cover.units_short)} units short` : ""}
            </dd>
          ) : (
            <dd className="font-medium text-green-700">
              <span aria-hidden="true">✓ </span>
              Arrives in time{coverDays - arrivalDays > 0 ? `, ${dayCount(coverDays - arrivalDays)} to spare` : ""}
            </dd>
          )}
        </div>
      </dl>
    </div>
  );
}
