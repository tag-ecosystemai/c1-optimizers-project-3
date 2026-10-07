import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/EmptyState";
import { KpiCard } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { AttentionCard } from "@/components/distributor/AttentionCard";
import { asOfDate, getMyOverview } from "@/lib/data";
import { date, num, relativeToAsOf } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

export default async function Page() {
  const [o, asOf] = await Promise.all([getMyOverview(), asOfDate()]);
  const { kpis } = o;

  return (
    <>
      <PageHeader title="Overview" description={`Your orders, your stock and anything that needs attention, as of ${date(asOf)}.`} />

      <section aria-label="Key numbers" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Orders in transit" value={num(kpis.orders_in_transit)} />
        <KpiCard label="Predicted late" value={num(kpis.orders_predicted_late)} />
        <KpiCard label="Products at risk" value={num(kpis.products_at_risk)} hint="May run out soon" />
        <KpiCard
          label="Nearest stockout"
          value={kpis.nearest_stockout_date ? date(kpis.nearest_stockout_date) : "None"}
          hint={kpis.nearest_stockout_date ? relativeToAsOf(kpis.nearest_stockout_date, asOf) : "No product is projected to run out"}
        />
      </section>

      <section aria-labelledby="attention" className="mb-8">
        <h2 id="attention" className="mb-3 text-lg text-fg">
          Needs attention
        </h2>
        {o.needs_attention.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {o.needs_attention.map((i) => (
              <AttentionCard key={i.incident_id} item={i} asOfDate={asOf} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing needs attention" description="None of your orders is putting your stock at risk right now." />
        )}
      </section>

      <section aria-labelledby="activity">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="activity" className="text-lg text-fg">
            Recent activity
          </h2>
          <Link href="/my/orders" className="text-sm text-muted hover:text-fg">
            All orders →
          </Link>
        </div>
        {o.recent_activity.length ? (
          <ul className="divide-y divide-line-faint rounded-xl border border-line-subtle bg-white">
            {o.recent_activity.map((a) => (
              <li key={`${a.order_id}-${a.date}`}>
                <Link href={`/my/orders/${a.order_id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-surface">
                  <span className="text-fg-2">{a.text}</span>
                  <span className="text-xs text-muted">{date(a.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No recent activity" description="New orders and shipments will show up here." />
        )}
      </section>
    </>
  );
}
