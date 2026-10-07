import Link from "next/link";
import type { MyOrder } from "@/types/api";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { StatusPill } from "@/components/app/StatusPill";
import { date, num } from "@/lib/format";

/** Phone layout for one order (the table takes over from md up). */
export function OrderCard({ order }: { order: MyOrder }) {
  const late = order.predicted_eta !== order.original_eta;
  return (
    <li>
      <Link
        href={`/my/orders/${order.order_id}`}
        className="flex flex-col gap-2 rounded-xl border border-line-subtle bg-white p-4 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-fg">Order #{order.order_id}</span>
          <SeverityBadge severity={order.risk} />
        </div>
        <p className="text-sm text-fg-2">
          {order.product.name} <span className="text-muted">· {num(order.quantity)} units</span>
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusPill status={order.status} />
          <span>{order.shipping_mode}</span>
          <span>· Ordered {date(order.order_date)}</span>
        </div>
        <p className="text-xs text-muted">
          Arrives{" "}
          {late ? (
            <>
              <span className="line-through">{date(order.original_eta)}</span> <span className="font-medium text-risk-high">{date(order.predicted_eta)}</span>
            </>
          ) : (
            <span className="text-fg">{date(order.predicted_eta)}</span>
          )}
        </p>
      </Link>
    </li>
  );
}
