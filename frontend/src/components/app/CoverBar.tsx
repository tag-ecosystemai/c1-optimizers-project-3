import type { Cascade } from "@/types/api";
import { RunwayBar } from "@/components/runout/RunwayBar";
import { date, daysBetween, num } from "@/lib/format";

export type CoverInput = Pick<Cascade, "days_of_cover" | "stockout_date" | "projected_arrival"> & { units_short?: number };

/**
 * The core visual (spec §4.4): stock burning down from the as-of date to the stockout date, a marker
 * where the delayed shipment lands, and a red gap between them. Pass a cascade straight in.
 * @param asOfDate   "Today" from asOfDate(), never the browser clock.
 * @param cover      days_of_cover, stockout_date, projected_arrival, optional units_short (e.g. incident.cascade).
 * @param windowDays Days shown across the bar (default 30).
 * @param compact    Bar only, no labels (for table rows).
 */
export function CoverBar({ asOfDate, cover, windowDays = 30, compact }: { asOfDate: string; cover: CoverInput; windowDays?: number; compact?: boolean }) {
  const coverDays = daysBetween(asOfDate, cover.stockout_date);
  const arrivalDays = daysBetween(asOfDate, cover.projected_arrival);
  const gap = arrivalDays - coverDays;
  const bar = <RunwayBar coverDays={coverDays} arrivalDays={arrivalDays} windowDays={Math.max(windowDays, arrivalDays + 2)} />;
  if (compact) return bar;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-muted">
        <span>Today · {date(asOfDate)}</span>
        <span>Stock runs out {date(cover.stockout_date)}</span>
      </div>
      {bar}
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span className="text-muted">Arrives {date(cover.projected_arrival)}</span>
        {gap > 0 ? (
          <span className="font-medium text-risk-high">
            {gap}-day gap{cover.units_short ? ` · ${num(cover.units_short)} units short` : ""}
          </span>
        ) : (
          <span className="font-medium text-green-700">Arrives in time</span>
        )}
      </div>
    </div>
  );
}
