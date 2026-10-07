import type { Metadata } from "next";
import type { IncidentListItem, IncidentListParams, IncidentSort, IncidentStatus, Market, OpsKpis, Severity } from "@/types/api";
import { getOpsNetwork, getOpsSummary, listIncidents } from "@/lib/data";
import { date, days, num, percent, usd } from "@/lib/format";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar } from "@/components/app/FilterBar";
import { KpiCard, type KpiDelta } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { StatusPill } from "@/components/app/StatusPill";
import { AutoRefresh } from "@/components/ops/AutoRefresh";
import { MarketChart } from "@/components/ops/MarketChart";

export const metadata: Metadata = { title: "Watchtower" };

const MARKETS: Market[] = ["Europe", "USCA", "LATAM", "Africa", "Pacific Asia"];
const SEVERITIES: Severity[] = ["HIGH", "MEDIUM", "LOW", "NONE"];
const STATUSES: IncidentStatus[] = ["open", "approved", "dismissed", "escalated", "resolved"];
const SORTS = ["money_at_risk_usd", "predicted_delay_days", "stockout_date", "units_short", "created_at", "severity"];
const DEFAULT_SORT = "-money_at_risk_usd";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

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
  { key: "delay", header: "Delay", sortKey: "predicted_delay_days", align: "right", cell: (r) => days(r.predicted_delay_days), hideBelow: "sm" },
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

export default async function Page({ searchParams }: PageProps<"/ops/watchtower">) {
  const sp = await searchParams;
  const sort = one(sp.sort);
  const distributorId = Number(one(sp.distributor_id));
  const params: IncidentListParams = {
    market: pick(one(sp.market), MARKETS),
    severity: pick(one(sp.severity), SEVERITIES),
    status: pick(one(sp.status), STATUSES),
    distributor_id: Number.isInteger(distributorId) && distributorId > 0 ? distributorId : undefined,
    q: one(sp.q) || undefined,
    sort: sort && SORTS.includes(sort.replace(/^-/, "")) ? (sort as IncidentSort) : DEFAULT_SORT,
    cursor: one(sp.cursor) || undefined,
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
              { param: "severity", label: "Severity", options: SEVERITIES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
              { param: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
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

        <section aria-labelledby="market-title" className="rounded-xl border border-line-subtle p-4">
          <h2 id="market-title" className="mb-3 text-base text-fg">
            $ at risk by market
          </h2>
          {summary.by_market.some((m) => m.money_at_risk_usd > 0) ? (
            <MarketChart data={summary.by_market} />
          ) : (
            <EmptyState title="Nothing at risk" description="No open incidents in any market." />
          )}
        </section>
      </div>
    </>
  );
}
