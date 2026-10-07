import { load } from "@/lib/load";
import type { Metadata } from "next";
import { Suspense } from "react";
import type { InventoryListParams, InventoryRow } from "@/types/api";
import { listWarehouseInventory } from "@/lib/data";
import { date, days, num } from "@/lib/format";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { LoadError } from "@/components/app/LoadError";
import { FilterBar } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { SEVERITIES, SEVERITY_OPTIONS, SeverityBadge } from "@/components/app/SeverityBadge";
import { Skeleton } from "@/components/app/Skeleton";
import { first, pick } from "@/lib/params";

export const metadata: Metadata = { title: "Inventory" };

type Search = Record<string, string | string[] | undefined>;

const SORTS = ["days_of_cover", "-days_of_cover", "stock_on_hand", "-stock_on_hand"] as const;

const columns: Column<InventoryRow>[] = [
  {
    key: "product",
    header: "Product",
    cell: (r) => (
      <span className="flex flex-col">
        <span className="text-fg">{r.product.name}</span>
        <span className="text-xs text-muted">{r.product.category}</span>
      </span>
    ),
  },
  { key: "stock", header: "Stock on hand", sortKey: "stock_on_hand", align: "right", hideBelow: "sm", cell: (r) => num(r.stock_on_hand) },
  { key: "asof", header: "As of", hideBelow: "md", cell: (r) => <span className="whitespace-nowrap">{date(r.as_of_date)}</span> },
  { key: "usage", header: "Weekly usage", align: "right", hideBelow: "sm", cell: (r) => num(r.weekly_usage) },
  { key: "cover", header: "Days of cover", sortKey: "days_of_cover", align: "right", cell: (r) => <span className="whitespace-nowrap">{days(r.days_of_cover)}</span> },
  { key: "severity", header: "Severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
];

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sort = first(sp.sort);
  const params: InventoryListParams = {
    category: first(sp.category),
    severity: pick(sp.severity, SEVERITIES),
    q: first(sp.q),
    sort: SORTS.find((s) => s === sort),
    cursor: first(sp.cursor),
  };
  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand, weekly usage across the distributors you serve, and days of cover per product." />
      <Suspense fallback={<Skeleton rows={8} />}>
        <Inventory params={params} />
      </Suspense>
    </>
  );
}

async function Inventory({ params }: { params: InventoryListParams }) {
    // ponytail: categories come from one unfiltered 100-row call; add a categories endpoint if a warehouse stocks more.
  const data = await load(() => Promise.all([listWarehouseInventory(params), listWarehouseInventory({ limit: 100 })]));
  if (!data) return <LoadError what="inventory" />;
  const [page, all] = data;
  const categories = [...new Set(all.items.map((r) => r.product.category).filter((c): c is string => !!c))].sort();
  const filtered = !!(params.category || params.severity || params.q);
  return (
    <>
      <FilterBar
        search={{ param: "q", placeholder: "Search products" }}
        filters={[
          { param: "category", label: "Category", options: categories.map((c) => ({ value: c, label: c })) },
          { param: "severity", label: "Severity", options: SEVERITY_OPTIONS },
        ]}
      />
      <DataTable
        caption="Inventory by product"
        columns={columns}
        rows={page.items}
        rowKey={(r) => r.product.id}
        defaultSort="days_of_cover"
        empty={
          <EmptyState
            title={filtered ? "No products match" : "No inventory yet"}
            description={filtered ? "Try another category, severity or search." : "Products stocked in this warehouse will appear here."}
          />
        }
      />
      {page.items.length > 0 && <Pagination nextCursor={page.next_cursor} prevCursor={page.prev_cursor} count={page.items.length} total={page.total} />}
    </>
  );
}
