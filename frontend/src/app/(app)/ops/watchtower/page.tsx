import type { Metadata } from "next";
import type { IncidentListItem, IncidentListParams, IncidentSort, Market, OpsKpis } from "@/types/api";
import { getOpsNetwork, getOpsSummary, listIncidents } from "@/lib/data";
import { date, days, num, percent, usd } from "@/lib/format";
import { first, pick, positiveInt } from "@/lib/params";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar } from "@/components/app/FilterBar";
import { KpiCard, type KpiDelta } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PANEL } from "@/components/app/Panel";
import { SEVERITIES, SEVERITY_OPTIONS, SeverityBadge } from "@/components/app/SeverityBadge";
import { INCIDENT_STATUSES, INCIDENT_STATUS_OPTIONS, StatusPill } from "@/components/app/StatusPill";
import { AutoRefresh } from "@/components/ops/AutoRefresh";
import { MarketChart } from "@/components/ops/MarketChart";

export const metadata: Metadata = { title: "Watchtower" };

const MARKETS: Market[] = ["Europe", "USCA", "LATAM", "Africa", "Pacific Asia"];
const SORTS = ["money_at_risk_usd", "predicted_delay_days", "stockout_date", "units_short", "created_at", "severity"];
const DEFAULT_SORT = "-money_at_risk_usd";


/** For every Watchtower KPI, going up is bad. */
function delta(now: number, before: number | undefined, fmt: (n: number) => string): KpiDelta | undefined {
  if (before === undefined) return undefined;
  const d = Math.round((now - before) * 1000) / 1000;
  if (d === 0) return { text: "no change", direction: "flat" };
  return { text: `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`, direction: d > 0 ? "up" : "down", tone: d > 0 ? "bad" : "good" };
}

const columns: Column<IncidentListItem>[] = [
  { key: "severity", header: "Severity", sortKey: "severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
  { key: "order", header: "Order", cell: (r) => <span className="font-medium text-fg">#{r.order_id}</span> },
  { key: "distributor", header: "Distributor", cell: (r) => r.distributor.name, hideBelow: "md" },
  { key: "product", header: "Product", cell: (r) => <span className="line-clamp-1 max-w-56">{r.product.name}</span>, hideBelow: "lg" },
  { key: "market", header: "Market", cell: (r) => r.market, hideBelow: "md" },
  { key: "delay", header: "Delay", sortKey: "predicted_delay_days", align: "right", cell: (r) => <span className="whitespace-nowrap">{days(r.predicted_delay_days)}</span>, hideBelow: "sm" },
  { key: "stockout", header: "Stockout", sortKey: "stockout_date", cell: (r) => <span className="whitespace-nowrap">{date(r.stockout_date)}</span>, hideBelow: "lg" },
  { key: "short", header: "Units short", sortKey: "units_short", align: "right", cell: (r) => num(r.units_short), hideBelow: "lg" },
  { key: "money", header: "$ at risk", sortKey: "money_at_risk_usd", align: "right", cell: (r) => (r.money_at_risk_usd === undefined ? "—" : usd(r.money_at_risk_usd)) },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <span className="flex flex-col items-start gap-0.5">
        <StatusPill status={r.status} />
        {r.investigating && <span className="text-[11px] text-muted">Investigating…</span>}
      </span>
    ),
  },
];

/** Daily counts as bars; each bar's date and count are in its label and tooltip, so it isn't colour-only. */
function TrendBars({ trend }: { trend: { date: string; opened: number }[] }) {
  const max = Math.max(1, ...trend.map((t) => t.opened));
  return (
    <>
      <ul className="flex h-20 items-end gap-1">
        {trend.map((t) => (
          <li
            key={t.date}
            title={`${date(t.date)}: ${num(t.opened)} opened`}
            aria-label={`${date(t.date)}: ${num(t.opened)} opened`}
            className="flex-1 rounded-sm bg-blue-500"
            style={{ height: t.opened ? `${(t.opened / max) * 100}%` : "2px", opacity: t.opened ? 1 : 0.25 }}
          />
        ))}
      </ul>
      {trend.length > 0 && (
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>{date(trend[0].date)}</span>
          <span>{date(trend[trend.length - 1].date)}</span>
        </div>
      )}
    </>
  );
}

export default async function Page({ searchParams }: PageProps<"/ops/watchtower">) {
  const sp = await searchParams;
  const sort = first(sp.sort);
  const params: IncidentListParams = {
    market: pick(sp.market, MARKETS),
    severity: pick(sp.severity, SEVERITIES),
    status: pick(sp.status, INCIDENT_STATUSES),
    distributor_id: positiveInt(sp.distributor_id),
    q: first(sp.q),
    sort: sort && SORTS.includes(sort.replace(/^-/, "")) ? (sort as IncidentSort) : DEFAULT_SORT,
    cursor: first(sp.cursor),
  };
  const [summary, page, network] = await Promise.all([getOpsSummary(), listIncidents(params), getOpsNetwork()]);
  const y: Partial<OpsKpis> = summary.yesterday ?? {};
  const filtered = Boolean(params.market || params.severity || params.status || params.distributor_id || params.q);

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader title="Watchtower" description="What needs your attention right now, ranked by dollars at risk. Refreshes every minute." />

      <section aria-label="Key numbers" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Open incidents" value={num(summary.open_incidents)} delta={delta(summary.open_incidents, y.open_incidents, num)} />
        <KpiCard label="$ at risk" value={usd(summary.money_at_risk_usd)} delta={delta(summary.money_at_risk_usd, y.money_at_risk_usd, (n) => usd(n))} />
        <KpiCard
          label="Late-risk rate"
          value={percent(summary.late_risk_rate)}
          delta={delta(summary.late_risk_rate, y.late_risk_rate, (n) => `${(n * 100).toFixed(0)} pts`)}
          hint="Orders in flight likely to be late"
        />
        <KpiCard label="Units short" value={num(summary.units_short)} delta={delta(summary.units_short, y.units_short, num)} />
        <KpiCard
          label="Avg predicted delay"
          value={days(summary.avg_predicted_delay_days)}
          delta={delta(summary.avg_predicted_delay_days, y.avg_predicted_delay_days, (n) => days(n))}
        />
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="queue-title" className="min-w-0">
          <h2 id="queue-title" className="mb-3 text-base text-fg">
            Incident queue
          </h2>
          <FilterBar
            search={{ param: "q", placeholder: "Search order, distributor, product" }}
            filters={[
              { param: "market", label: "Market", options: MARKETS.map((m) => ({ value: m, label: m })) },
              { param: "severity", label: "Severity", options: SEVERITY_OPTIONS },
              { param: "status", label: "Status", options: INCIDENT_STATUS_OPTIONS },
              {
                param: "distributor_id",
                label: "Distributor",
                options: network.flatMap((w) => w.distributors.map((d) => ({ value: String(d.id), label: d.name }))),
              },
            ]}
          />
          <DataTable
            caption="Incidents ranked by dollars at risk"
            columns={columns}
            rows={page.items}
            rowKey={(r) => r.incident_id}
            rowHref={(r) => `/ops/incidents/${r.incident_id}`}
            defaultSort={DEFAULT_SORT}
            empty={
              <EmptyState
                title={filtered ? "No incidents match these filters" : "No incidents"}
                description={filtered ? "Try a different market, severity or status, or clear the search." : "Nothing is projected to run out. New incidents appear here as orders are scored."}
              />
            }
          />
          {page.items.length > 0 && <Pagination nextCursor={page.next_cursor} prevCursor={page.prev_cursor} count={page.items.length} total={page.total} />}
        </section>

        {/* Side panels: below 2xl they sit under the queue; at 2xl they stick under the header and scroll on their own. */}
        <aside
          aria-label="Breakdowns"
          className="flex min-w-0 flex-col gap-6 md:max-2xl:grid md:max-2xl:grid-cols-3 md:max-2xl:items-start 2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-6rem)] 2xl:self-start 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:pr-1"
        >
          <section aria-labelledby="market-title" className={PANEL}>
            <h2 id="market-title" className="mb-3 text-base text-fg">
              $ at risk by market
            </h2>
            {summary.by_market.some((m) => m.money_at_risk_usd > 0) ? (
              <MarketChart data={summary.by_market} />
            ) : (
              <EmptyState title="Nothing at risk" description="No open incidents in any market." />
            )}
          </section>

          <section aria-labelledby="products-title" className={PANEL}>
            <h2 id="products-title" className="mb-3 text-base text-fg">
              Top 5 products at risk
            </h2>
            {summary.top_products.length ? (
              <ol className="flex flex-col gap-2.5 text-sm">
                {summary.top_products.slice(0, 5).map((p, i) => (
                  <li key={p.product.id} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 text-xs text-muted tabular-nums">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-fg" title={p.product.name}>
                        {p.product.name}
                      </span>
                      <span className="text-xs text-muted">
                        {num(p.open_incidents)} open {p.open_incidents === 1 ? "incident" : "incidents"}
                      </span>
                    </span>
                    <span className="text-fg tabular-nums">{usd(p.money_at_risk_usd)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="Nothing at risk" description="No product has an open incident." />
            )}
          </section>

          <section aria-labelledby="trend-title" className={PANEL}>
            <h2 id="trend-title" className="mb-1 text-base text-fg">
              Incidents opened per day
            </h2>
            <p className="mb-3 text-xs text-muted">
              {num(summary.trend.reduce((n, t) => n + t.opened, 0))} in the last {summary.trend.length} days
            </p>
            <TrendBars trend={summary.trend} />
          </section>
        </aside>
      </div>
    </>
  );
}
