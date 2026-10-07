import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import type { InventoryRow, Page, WarehouseOverview } from "@/types/api";
import { getWarehouseOverview, listWarehouseInventory } from "@/lib/data";
import { days, num, usd } from "@/lib/format";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { KpiCard } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { Skeleton } from "@/components/app/Skeleton";

export const metadata: Metadata = { title: "Warehouse overview" };

export default function Page() {
  return (
    <>
      <PageHeader title="Warehouse overview" description="Stock running thin and the distributors it affects." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
      <section aria-labelledby="thin-title" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="thin-title" className="text-base text-fg">
            Lowest cover
          </h2>
          <Link href="/warehouse/inventory" className="text-sm text-muted hover:text-fg">
            All inventory →
          </Link>
        </div>
        <Suspense fallback={<Skeleton rows={5} />}>
          <LowestCover />
        </Suspense>
      </section>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["Open incidents", "Low-cover SKUs", "Stock on hand", "Distributors affected"].map((l) => (
          <KpiCard key={l} label={l} value="" loading />
        ))}
      </div>
      <div className="mt-8">
        <Skeleton rows={3} />
      </div>
    </>
  );
}

async function Overview() {
  let data: WarehouseOverview;
  try {
    data = await getWarehouseOverview();
  } catch (e) {
    unstable_rethrow(e);
    return <ErrorState message="We couldn't load your warehouse overview. Try again in a moment." />;
  }
  const { kpis, distributors, warehouse } = data;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Open incidents"
          value={num(kpis.open_incidents)}
          hint={kpis.money_at_risk_usd !== undefined ? `${usd(kpis.money_at_risk_usd)} at risk` : undefined}
        />
        <KpiCard label={`SKUs under ${kpis.low_cover_threshold_days} days of cover`} value={num(kpis.low_cover_skus)} />
        <KpiCard label="Stock on hand" value={num(kpis.stock_units)} hint="units, all products" />
        <KpiCard label="Distributors affected" value={`${kpis.distributors_affected} of ${distributors.length}`} />
      </div>

      <section aria-labelledby="served-title" className="mt-8">
        <h2 id="served-title" className="mb-3 text-base text-fg">
          Distributors served by {warehouse.name}
        </h2>
        {distributors.length === 0 ? (
          <EmptyState title="No distributors" description="This warehouse doesn't serve any distributors yet." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {distributors.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-line-subtle bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{d.name}</p>
                    <p className="text-xs text-muted">{d.segment}</p>
                  </div>
                  <SeverityBadge severity={d.status} />
                </div>
                <p className="text-xs text-fg-2 tabular-nums">
                  {d.open_incidents === 0 ? "No open incidents" : `${d.open_incidents} open incident${d.open_incidents === 1 ? "" : "s"}`}
                  {d.money_at_risk_usd ? ` · ${usd(d.money_at_risk_usd)} at risk` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function LowestCover() {
  let page: Page<InventoryRow>;
  try {
    page = await listWarehouseInventory({ sort: "days_of_cover", limit: 5 });
  } catch (e) {
    unstable_rethrow(e);
    return <ErrorState message="We couldn't load inventory. Try again in a moment." />;
  }
  if (!page.items.length) return <EmptyState title="No inventory yet" description="Products stocked here will appear once the data loads." />;
  return (
    <ul className="divide-y divide-line-faint rounded-xl border border-line-subtle bg-white">
      {page.items.map((r) => (
        <li key={r.product.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-fg">{r.product.name}</p>
            <p className="text-xs text-muted">{r.product.category}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm text-fg-2 tabular-nums">{days(r.days_of_cover)}</span>
            <SeverityBadge severity={r.severity} />
          </div>
        </li>
      ))}
    </ul>
  );
}
