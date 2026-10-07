import type { Metadata } from "next";
import type { MyStockRow } from "@/types/api";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { asOfDate, getMyStock } from "@/lib/data";
import { date, days, num, relativeToAsOf } from "@/lib/format";

export const metadata: Metadata = { title: "My stock" };

/** Weekly order quantities as a tiny line; the label carries the numbers. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-muted">—</span>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - ((v - min) / (max - min || 1)) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" role="img" aria-label={`Last ${values.length} weeks: ${num(min)} to ${num(max)} units a week, latest ${num(values[values.length - 1])}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500" />
    </svg>
  );
}

export default async function Page() {
  const [rows, asOf] = await Promise.all([getMyStock(), asOfDate()]);

  const columns: Column<MyStockRow>[] = [
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="text-fg">{r.product.name}</span>
          {r.product.category && <span className="text-xs text-muted">{r.product.category}</span>}
        </span>
      ),
    },
    { key: "history", header: "Recent weeks", hideBelow: "md", cell: (r) => <Sparkline values={r.weekly_history ?? []} /> },
    { key: "usage", header: "Weekly usage (forecast)", align: "right", hideBelow: "sm", cell: (r) => `${num(Math.round(r.weekly_usage_forecast))} units` },
    {
      key: "cover",
      header: "Days of cover",
      align: "right",
      cell: (r) => (
        <span className="flex flex-col">
          {days(r.days_of_cover)}
          {/* The "Runs out" column is hidden on phones, so the date rides along here. */}
          {r.stockout_date && <span className="text-xs text-muted sm:hidden">Runs out {date(r.stockout_date)}</span>}
        </span>
      ),
    },
    {
      key: "stockout",
      header: "Runs out",
      hideBelow: "sm",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.stockout_date ? (
          <span className="flex flex-col">
            {date(r.stockout_date)}
            <span className="text-xs text-muted">{relativeToAsOf(r.stockout_date, asOf)}</span>
          </span>
        ) : (
          <span className="text-muted">Not projected</span>
        ),
    },
    { key: "status", header: "Status", cell: (r) => <SeverityBadge severity={r.severity} /> },
  ];

  return (
    <>
      <PageHeader title="My stock" description={`How long each product will last at your forecast usage, lowest cover first. As of ${date(asOf)}.`} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.product.id}
        caption="My stock, lowest cover first"
        empty={<EmptyState title="No stock data yet" description="Your products and how long they will last will appear here." />}
      />
    </>
  );
}
