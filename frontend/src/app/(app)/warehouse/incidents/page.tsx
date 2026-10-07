import { load } from "@/lib/load";
import type { Metadata } from "next";
import { Suspense } from "react";
import type { IncidentListItem, IncidentListParams, IncidentSort } from "@/types/api";
import { asOfDate, listIncidents } from "@/lib/data";
import { date, days, num, relativeToAsOf, usd } from "@/lib/format";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { LoadError } from "@/components/app/LoadError";
import { FilterBar } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { SEVERITIES, SEVERITY_OPTIONS, SeverityBadge } from "@/components/app/SeverityBadge";
import { Skeleton } from "@/components/app/Skeleton";
import { INCIDENT_STATUSES, INCIDENT_STATUS_OPTIONS, StatusPill } from "@/components/app/StatusPill";
import { AcknowledgeButton } from "@/components/warehouse/AcknowledgeButton";
import { first, pick } from "@/lib/params";

export const metadata: Metadata = { title: "Incidents" };

type Search = Record<string, string | string[] | undefined>;

const SORT_KEYS = ["money_at_risk_usd", "predicted_delay_days", "stockout_date", "units_short", "created_at", "severity"];
const DEFAULT_SORT = "-money_at_risk_usd";

function columns(asOf: string): Column<IncidentListItem>[] {
  return [
    {
      key: "id",
      header: "Incident",
      cell: (i) => (
        <span className="flex flex-col whitespace-nowrap">
          <span className="text-fg">#{i.incident_id}</span>
          <span className="text-xs text-muted">Order #{i.order_id}</span>
          {/* Phones: the Action column is hidden, so the button lives here. */}
          <span className="mt-1.5 md:hidden">
            <AcknowledgeButton incidentId={i.incident_id} orderId={i.order_id} acknowledged={i.acknowledged_by_warehouse} />
          </span>
        </span>
      ),
    },
    {
      key: "what",
      header: "Distributor · product",
      cell: (i) => (
        <span className="flex flex-col sm:min-w-40">
          <span className="text-fg">{i.distributor.name}</span>
          <span className="text-xs text-muted">{i.product.name}</span>
        </span>
      ),
    },
    { key: "delay", header: "Delay", sortKey: "predicted_delay_days", align: "right", hideBelow: "md", cell: (i) => <span className="whitespace-nowrap">{days(i.predicted_delay_days, { sign: true })}</span> },
    {
      key: "stockout",
      header: "Stockout",
      sortKey: "stockout_date",
      hideBelow: "sm",
      cell: (i) => (
        <span className="flex flex-col whitespace-nowrap">
          <span>{date(i.stockout_date)}</span>
          <span className="text-xs text-muted">{relativeToAsOf(i.stockout_date, asOf)}</span>
        </span>
      ),
    },
    { key: "short", header: "Units short", sortKey: "units_short", align: "right", hideBelow: "lg", cell: (i) => num(i.units_short) },
    { key: "money", header: "At risk", sortKey: "money_at_risk_usd", align: "right", hideBelow: "md", cell: (i) => (i.money_at_risk_usd !== undefined ? usd(i.money_at_risk_usd) : "—") },
    {
      key: "state",
      header: "Severity · status",
      cell: (i) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={i.severity} />
          <StatusPill status={i.status} />
        </span>
      ),
    },
    { key: "ack", header: "Action", align: "right", hideBelow: "md", cell: (i) => <AcknowledgeButton incidentId={i.incident_id} orderId={i.order_id} acknowledged={i.acknowledged_by_warehouse} /> },
  ];
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sort = first(sp.sort);
  const params: IncidentListParams = {
    status: pick(sp.status, INCIDENT_STATUSES),
    severity: pick(sp.severity, SEVERITIES),
    q: first(sp.q),
    sort: sort && SORT_KEYS.includes(sort.replace(/^-/, "")) ? (sort as IncidentSort) : DEFAULT_SORT,
    cursor: first(sp.cursor),
  };
  return (
    <>
      <PageHeader
        title="Incidents"
        description="Late orders that put your distributors' stock at risk. Ops decides the fix; you can acknowledge that your warehouse has seen it."
      />
      <FilterBar
        search={{ param: "q", placeholder: "Search order, distributor or product" }}
        filters={[
          { param: "status", label: "Status", options: INCIDENT_STATUS_OPTIONS },
          { param: "severity", label: "Severity", options: SEVERITY_OPTIONS },
        ]}
      />
      <Suspense fallback={<Skeleton rows={6} />}>
        <Incidents params={params} />
      </Suspense>
    </>
  );
}

async function Incidents({ params }: { params: IncidentListParams }) {
  const data = await load(() => Promise.all([listIncidents(params), asOfDate()]));
  if (!data) return <LoadError what="incidents" />;
  const [page, asOf] = data;
  const filtered = !!(params.status || params.severity || params.q);
  return (
    <>
      <DataTable
        caption="Incidents in your warehouse"
        columns={columns(asOf)}
        rows={page.items}
        rowKey={(i) => i.incident_id}
        defaultSort={DEFAULT_SORT}
        empty={
          <EmptyState
            title={filtered ? "No incidents match" : "No incidents"}
            description={filtered ? "Try another status, severity or search." : "Nothing in your warehouse is putting a distributor at risk right now."}
          />
        }
      />
      {page.items.length > 0 && <Pagination nextCursor={page.next_cursor} prevCursor={page.prev_cursor} count={page.items.length} total={page.total} />}
    </>
  );
}
