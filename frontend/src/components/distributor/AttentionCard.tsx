import Link from "next/link";
import type { IncidentListItem } from "@/types/api";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { date, days, num, relativeToAsOf } from "@/lib/format";

/** One at-risk product in plain language (distributor "Needs attention" list). Renders only distributor-safe fields. */
export function AttentionCard({ item, asOfDate }: { item: IncidentListItem; asOfDate: string }) {
  const late = item.max_predicted_delay_days ?? 0;
  return (
    <Link
      href="/my/stock"
      className="flex flex-col gap-3 rounded-xl border border-line-subtle bg-white p-4 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">{item.product.name}</span>
        <SeverityBadge severity={item.severity} />
      </div>
      <p className="text-sm text-fg-2">
        {num(item.orders_affected)} {item.orders_affected === 1 ? "order" : "orders"} affected
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {late > 0 && (
          <div>
            <dt className="text-muted">Running late</dt>
            <dd className="text-fg tabular-nums">{days(late, { sign: true })}</dd>
          </div>
        )}
        {item.first_arrival && (
          <div>
            <dt className="text-muted">Next delivery</dt>
            <dd className="text-fg">{date(item.first_arrival)}</dd>
          </div>
        )}
        {item.stockout_date && (
          <div>
            <dt className="text-muted">Stock runs out</dt>
            <dd className="text-risk-high">
              {date(item.stockout_date)} <span className="text-muted">· {relativeToAsOf(item.stockout_date, asOfDate)}</span>
            </dd>
          </div>
        )}
        {item.units_short > 0 && (
          <div>
            <dt className="text-muted">Short by</dt>
            <dd className="text-fg tabular-nums">{num(item.units_short)} units</dd>
          </div>
        )}
      </dl>
    </Link>
  );
}