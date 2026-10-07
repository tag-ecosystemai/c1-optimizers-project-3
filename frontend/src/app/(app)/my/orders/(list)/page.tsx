import { first, isoDate, pick } from "@/lib/params";
import type { Metadata } from "next";
import Link from "next/link";
import type { MyOrder, MyOrderListParams, OrderStatus, Severity, ShippingMode } from "@/types/api";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, type FilterDef } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { StatusPill } from "@/components/app/StatusPill";
import { OrderCard } from "@/components/distributor/OrderCard";
import { listMyOrders } from "@/lib/data";
import { date, num } from "@/lib/format";

export const metadata: Metadata = { title: "My orders" };

const STATUSES: OrderStatus[] = ["processing", "in_transit", "delivered"];
const RISKS: Severity[] = ["HIGH", "MEDIUM", "LOW", "NONE"];
const MODES: ShippingMode[] = ["Standard Class", "Second Class", "First Class", "Same Day"];
const RISK_LABEL: Record<Severity, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low", NONE: "Covered" };

const filters: FilterDef[] = [
  { param: "status", label: "Status", options: [{ value: "processing", label: "Processing" }, { value: "in_transit", label: "In transit" }, { value: "delivered", label: "Delivered" }] },
  { param: "risk", label: "Risk", options: RISKS.map((r) => ({ value: r, label: RISK_LABEL[r] })) },
  { param: "shipping_mode", label: "Shipping", options: MODES.map((m) => ({ value: m, label: m })) },
  { param: "from", label: "Ordered from", kind: "date" },
  { param: "to", label: "Ordered to", kind: "date" },
];

const columns: Column<MyOrder>[] = [
  { key: "order", header: "Order", cell: (o) => <span className="font-medium text-fg">#{o.order_id}</span> },
  { key: "product", header: "Product", cell: (o) => o.product.name },
  { key: "qty", header: "Qty", align: "right", cell: (o) => num(o.quantity), hideBelow: "lg" },
  { key: "date", header: "Ordered", cell: (o) => date(o.order_date), className: "whitespace-nowrap", hideBelow: "lg" },
  { key: "mode", header: "Shipping", cell: (o) => o.shipping_mode, className: "whitespace-nowrap", hideBelow: "lg" },
  { key: "status", header: "Status", cell: (o) => <StatusPill status={o.status} /> },
  { key: "eta", header: "Original ETA", cell: (o) => date(o.original_eta), className: "whitespace-nowrap" },
  {
    key: "predicted",
    header: "Predicted ETA",
    className: "whitespace-nowrap",
    cell: (o) => <span className={o.predicted_eta !== o.original_eta ? "font-medium text-risk-high" : ""}>{date(o.predicted_eta)}</span>,
  },
  { key: "risk", header: "Risk", cell: (o) => <SeverityBadge severity={o.risk} /> },
];


export default async function Page({ searchParams }: PageProps<"/my/orders">) {
  const sp = await searchParams;
  const params: MyOrderListParams = {
    status: pick(sp.status, STATUSES),
    risk: pick(sp.risk, RISKS),
    shipping_mode: pick(sp.shipping_mode, MODES),
    from: isoDate(sp.from),
    to: isoDate(sp.to),
    q: first(sp.q),
    cursor: first(sp.cursor),
  };
  const page = await listMyOrders(params);
  const filtered = Object.entries(params).some(([k, v]) => k !== "cursor" && v);

  return (
    <>
      <PageHeader title="My orders" description="Every order with its predicted arrival. Tap an order for details." />
      <FilterBar filters={filters} search={{ param: "q", placeholder: "Search by order # or product" }} />

      {page.items.length ? (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {page.items.map((o) => (
              <OrderCard key={o.order_id} order={o} />
            ))}
          </ul>
          <div className="max-md:hidden">
            <DataTable columns={columns} rows={page.items} rowKey={(o) => o.order_id} rowHref={(o) => `/my/orders/${o.order_id}`} caption="My orders" />
          </div>
          <Pagination nextCursor={page.next_cursor} prevCursor={page.prev_cursor} count={page.items.length} total={page.total} />
        </>
      ) : filtered ? (
        <EmptyState
          title="No orders match these filters"
          description="Try a different status, risk or date range."
          action={
            <Link href="/my/orders" className="text-sm text-fg underline">
              Clear filters
            </Link>
          }
        />
      ) : (
        <EmptyState title="No orders yet" description="Your orders will appear here once they are placed." />
      )}
    </>
  );
}
