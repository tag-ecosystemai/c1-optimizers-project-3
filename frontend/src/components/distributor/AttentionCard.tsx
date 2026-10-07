import Link from "next/link";
import type { IncidentListItem } from "@/types/api";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { date, days, num, relativeToAsOf } from "@/lib/format";

/** One at-risk order in plain language (distributor "Needs attention" list). Renders only distributor-safe fields. */
export function AttentionCard({ item, asOfDate }: { item: IncidentListItem; asOfDate: string }) {
  return (
    <Link
      href={`/my/orders/${item.order_id}`}
      className="flex flex-col gap-3 rounded-xl border border-line-subtle bg-white p-4 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">Order #{item.order_id}</span>
        <SeverityBadge severity={item.severity} />
      </div>
      <p className="text-sm text-fg-2">{item.product.name}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Running late</dt>
          <dd className="text-fg tabular-nums">{days(item.predicted_delay_days, { sign: true })}</dd>
        </div>
        <div>
          <dt className="text-muted">New arrival</dt>
          <dd className="text-fg">{date(item.projected_arrival)}</dd>
        </div>
        <div>
          <dt className="text-muted">Stock runs out</dt>
          <dd className="text-risk-high">
            {date(item.stockout_date)} <span className="text-muted">· {relativeToAsOf(item.stockout_date, asOfDate)}</span>
          </dd>
        </div>
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
