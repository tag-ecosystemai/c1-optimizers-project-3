import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { DISTRIBUTOR_OVERVIEW_TERMS, Explainer } from "@/components/app/Explainer";
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

      <section aria-label="Key numbers" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Orders in transit" value={num(kpis.orders_in_transit)} />
        <KpiCard accent={kpis.orders_predicted_late > 0 ? "high" : "ok"} label="Predicted late" value={num(kpis.orders_predicted_late)} />
        <KpiCard accent={kpis.products_at_risk > 0 ? "medium" : "ok"} label="Products at risk" value={num(kpis.products_at_risk)} hint="May run out soon" />
        <KpiCard
          accent={kpis.nearest_stockout_date ? "high" : "ok"}
          label="Nearest stockout"
          value={kpis.nearest_stockout_date ? date(kpis.nearest_stockout_date) : "None"}
          hint={kpis.nearest_stockout_date ? relativeToAsOf(kpis.nearest_stockout_date, asOf) : "No product is projected to run out"}
        />
      </section>

      <Explainer terms={DISTRIBUTOR_OVERVIEW_TERMS} />

      <section aria-labelledby="attention" className="mb-8 overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-soft">
        <header className="flex items-center gap-3 border-b border-line-subtle bg-surface px-5 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-ink text-signal">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 id="attention" className="font-display text-lg font-semibold text-fg">
              Needs attention
            </h2>
            <p className="text-sm text-muted">Open incidents that affect your orders.</p>
          </div>
        </header>
        <div className="p-5">
          {o.needs_attention.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {o.needs_attention.map((i) => (
                <AttentionCard key={i.incident_id} item={i} asOfDate={asOf} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing needs attention" description="None of your orders is putting your stock at risk right now." />
          )}
        </div>
      </section>

      <section aria-labelledby="activity" className="overflow-hidden rounded-2xl border border-line-subtle bg-white shadow-soft">
        <header className="flex items-center justify-between gap-3 border-b border-line-subtle bg-surface px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-ink text-signal">
              <Activity className="size-4" />
            </span>
            <div>
              <h2 id="activity" className="font-display text-lg font-semibold text-fg">
                Recent activity
              </h2>
              <p className="text-sm text-muted">The latest changes to your orders.</p>
            </div>
          </div>
          <Link href="/my/orders" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            All orders <ArrowRight className="size-4" />
          </Link>
        </header>
        {o.recent_activity.length ? (
          <ul className="divide-y divide-line-faint">
            {o.recent_activity.map((a) => (
              <li key={`${a.order_id}-${a.date}`}>
                <Link href={`/my/orders/${a.order_id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-3 text-sm hover:bg-surface">
                  <span className="text-fg-2">{a.text}</span>
                  <span className="text-xs text-muted">{date(a.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState title="No recent activity" description="New orders and shipments will show up here." />
          </div>
        )}
      </section>
    </>
  );
}