import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PillStatus } from "@/components/app/StatusPill";
import type { Severity, TimelineEvent } from "@/types/api";
import { authMode } from "@/lib/data";
import { addDays, days, num, usd } from "@/lib/format";
import { buildIncidents, type MockIncident } from "@/mocks/incidents";
import { AS_OF_DATE, distributorById, warehouseById } from "@/mocks/network";
import { productById } from "@/mocks/products";
import { CoverBar } from "@/components/app/CoverBar";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { EvidenceList } from "@/components/app/EvidenceList";
import { FilterBar } from "@/components/app/FilterBar";
import { KpiCard } from "@/components/app/KpiCard";
import { OptionCard } from "@/components/app/OptionCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { ShapChart } from "@/components/app/ShapChart";
import { Skeleton } from "@/components/app/Skeleton";
import { StatusPill } from "@/components/app/StatusPill";
import { Timeline } from "@/components/app/Timeline";
import { DialogDemo, ErrorRetryDemo, OptionDemo } from "./Demos";

export const metadata: Metadata = { title: "Components · RunOut dev", robots: { index: false } };

const PAGE_SIZE = 6;
const severityRank: Record<Severity, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
const statuses: PillStatus[] = ["open", "approved", "dismissed", "escalated", "resolved", "acknowledged", "processing", "in_transit", "delivered"];
const btn =
  "inline-flex h-9 items-center rounded-[10px] border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

const name = {
  distributor: (i: MockIncident) => distributorById(i.distributor_id)?.name ?? "—",
  product: (i: MockIncident) => productById(i.product_id)?.name ?? "—",
  market: (i: MockIncident) => warehouseById(i.warehouse_id)?.market ?? "—",
};

const columns: Column<MockIncident>[] = [
  { key: "id", header: "Incident", cell: (i) => `#${i.incident_id}` },
  { key: "severity", header: "Severity", sortKey: "severity", cell: (i) => <SeverityBadge severity={i.severity} /> },
  { key: "distributor", header: "Distributor", cell: name.distributor, hideBelow: "md" },
  { key: "product", header: "Product", cell: name.product, hideBelow: "lg" },
  { key: "cover", header: "Cover", cell: (i) => <CoverBar asOfDate={AS_OF_DATE} cover={i.cascade} compact />, hideBelow: "sm", className: "w-36" },
  { key: "delay", header: "Delay", sortKey: "predicted_delay_days", align: "right", cell: (i) => days(i.cascade.predicted_delay_days), hideBelow: "sm" },
  { key: "money", header: "$ at risk", sortKey: "money_at_risk_usd", align: "right", cell: (i) => usd(i.cascade.money_at_risk_usd) },
  { key: "status", header: "Status", cell: (i) => <StatusPill status={i.status} /> },
];

function sortRows(rows: MockIncident[], sort: string) {
  const key = sort.replace(/^-/, "");
  const dir = sort.startsWith("-") ? -1 : 1;
  const value = (i: MockIncident) =>
    key === "severity" ? severityRank[i.severity] : key === "predicted_delay_days" ? i.cascade.predicted_delay_days : i.cascade.money_at_risk_usd;
  return [...rows].sort((a, b) => (value(a) - value(b)) * dir);
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line-subtle pt-8">
      <div>
        <h2 id={id} className="text-lg text-fg">
          {title}
        </h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 font-mono text-xs text-muted">{children}</p>;
}

export default async function ComponentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (authMode() !== "mock") notFound();

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const incidents = buildIncidents();
  const hero = incidents.find((i) => i.incident_id === 812)!;

  // The table demo filters, sorts and pages in the URL like a real list screen.
  const q = one("q").toLowerCase();
  const filtered = incidents.filter(
    (i) =>
      (!one("severity") || i.severity === one("severity")) &&
      (!one("status") || i.status === one("status")) &&
      (!q || `${i.incident_id} ${name.distributor(i)} ${name.product(i)}`.toLowerCase().includes(q)),
  );
  const sorted = sortRows(filtered, one("sort") || "-money_at_risk_usd");
  const offset = Number(one("cursor")) || 0;
  const page = sorted.slice(offset, offset + PAGE_SIZE);
  const next = offset + PAGE_SIZE < sorted.length ? String(offset + PAGE_SIZE) : null;
  const prev = offset > PAGE_SIZE ? String(offset - PAGE_SIZE) : null;

  const timeline: TimelineEvent[] = [
    { key: "ordered", label: "Ordered", date: hero.order_date, state: "done" },
    { key: "shipped", label: "Shipped by Second Class", date: hero.shipping_date, state: "done" },
    { key: "original_eta", label: "Original arrival date", date: hero.original_eta, state: "upcoming" },
    { key: "stockout", label: "Your stock runs out", date: hero.cascade.stockout_date, state: "warning" },
    { key: "predicted_eta", label: "Predicted arrival", date: hero.cascade.projected_arrival, state: "warning" },
  ].sort((a, b) => a.date.localeCompare(b.date)) as TimelineEvent[];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-8">
      <PageHeader
        back={{ href: "/", label: "Home" }}
        eyebrow={
          <>
            <span className="font-mono text-xs">src/components/app</span>
            <StatusPill status="open" />
          </>
        }
        title="Shared components"
        description="Every app component in every state, on mock data. This page only exists in mock mode. Try Tab, Shift+Tab, Enter and Esc."
        actions={
          <>
            <a href="#table" className={`${btn} border-white-800 bg-white text-black-400 hover:bg-white-300`}>
              Jump to table
            </a>
            <a href="#dialog" className={`${btn} border-black-600 bg-black-200 text-white hover:bg-black-500`}>
              Jump to dialog
            </a>
          </>
        }
      />

      <Section id="badges" title="SeverityBadge and StatusPill" note="Text plus colour, never colour alone.">
        <div className="flex flex-wrap gap-2">
          {(["HIGH", "MEDIUM", "LOW", "NONE"] as Severity[]).map((s) => (
            <SeverityBadge key={s} severity={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section id="kpi" title="KpiCard" note="With deltas (good, bad, neutral), with a hint, and loading.">
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Open incidents" value="9" delta={{ text: "+2", direction: "up", tone: "bad" }} />
          <KpiCard label="$ at risk" value={usd(4125)} delta={{ text: `−${usd(340)}`, direction: "down", tone: "good" }} />
          <KpiCard label="Late-risk rate" value="18%" delta={{ text: "0 pts", direction: "flat" }} hint="Share of orders above the risk threshold" />
          <KpiCard label="Units short" value={num(1240)} hint="Across 9 distributors" />
          <KpiCard label="Open incidents" value="9" loading />
          <KpiCard label="$ at risk" value="" loading />
        </div>
      </Section>

      <Section id="cover" title="CoverBar" note={`Day 0 is the data's as-of date (${AS_OF_DATE}), never the browser clock.`}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>late: incident #812 (red gap, units short)</Label>
            <CoverBar asOfDate={AS_OF_DATE} cover={hero.cascade} />
          </div>
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>arrives in time</Label>
            <CoverBar asOfDate={AS_OF_DATE} cover={{ days_of_cover: 18, stockout_date: addDays(AS_OF_DATE, 18), projected_arrival: addDays(AS_OF_DATE, 9) }} />
          </div>
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>already out of stock</Label>
            <CoverBar asOfDate={AS_OF_DATE} cover={{ days_of_cover: 0, stockout_date: AS_OF_DATE, projected_arrival: addDays(AS_OF_DATE, 6), units_short: 85 }} />
          </div>
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>long cover (window grows to 45 days)</Label>
            <CoverBar asOfDate={AS_OF_DATE} cover={{ days_of_cover: 40, stockout_date: addDays(AS_OF_DATE, 40), projected_arrival: addDays(AS_OF_DATE, 43), units_short: 12 }} />
          </div>
          <div className="rounded-xl border border-line-subtle bg-white p-4 lg:col-span-2">
            <Label>compact (table rows)</Label>
            <div className="flex max-w-xs flex-col gap-3">
              <CoverBar asOfDate={AS_OF_DATE} cover={hero.cascade} compact />
              <CoverBar asOfDate={AS_OF_DATE} cover={{ days_of_cover: 18, stockout_date: addDays(AS_OF_DATE, 18), projected_arrival: addDays(AS_OF_DATE, 9) }} compact />
            </div>
          </div>
        </div>
      </Section>

      <Section id="table" title="FilterBar, DataTable and Pagination" note="Live: filters, sort and cursor all live in the URL. Rows link to # anchors. Sticky header scrolls inside the box.">
        <div>
          <FilterBar
            search={{ param: "q", placeholder: "Search incident, distributor, product" }}
            filters={[
              { param: "severity", label: "Severity", options: (["HIGH", "MEDIUM", "LOW"] as const).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
              { param: "status", label: "Status", options: (["open", "approved", "dismissed", "escalated", "resolved"] as const).map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
              { param: "from", label: "Created from", kind: "date" },
            ]}
          />
          <DataTable
            caption="Incidents, sorted by money at risk"
            columns={columns}
            rows={page}
            rowKey={(i) => i.incident_id}
            rowHref={(i) => `#incident-${i.incident_id}`}
            defaultSort="-money_at_risk_usd"
            empty={<EmptyState title="No incidents match" description="Try another severity or status, or clear the search." />}
          />
          <Pagination nextCursor={next} prevCursor={prev} count={page.length} total={sorted.length} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Label>DataTable, no rows, default empty</Label>
            <DataTable columns={columns.slice(0, 3)} rows={[] as MockIncident[]} rowKey={(i) => i.incident_id} />
          </div>
          <div>
            <Label>Skeleton rows=5 (table loading)</Label>
            <Skeleton rows={5} />
          </div>
        </div>
      </Section>

      <Section id="incident" title="Timeline, EvidenceList and ShapChart" note="Incident #812: order #55123 to Brazil Consumer.">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>Timeline with asOfDate</Label>
            <Timeline events={timeline} asOfDate={AS_OF_DATE} />
          </div>
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>ShapChart with riskScore</Label>
            <ShapChart factors={hero.shap} riskScore={hero.cascade.delay_risk_score} />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Label>EvidenceList</Label>
            <EvidenceList items={hero.evidence} />
          </div>
          <div className="rounded-xl border border-line-subtle bg-white p-4">
            <Label>ShapChart, positive only, no score</Label>
            <ShapChart factors={hero.shap.filter((f) => f.contribution > 0).slice(0, 3)} />
          </div>
        </div>
        <div>
          <Label>Timeline without asOfDate</Label>
          <Timeline events={timeline.slice(0, 3)} />
        </div>
      </Section>

      <Section id="options" title="OptionCard" note="Radio inputs: arrow keys move between cards, Space selects.">
        <OptionDemo options={hero.recommended_options} />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>disabled (after a decision), no cost or ETA fields</Label>
            <OptionCard name="locked" option={{ ...hero.recommended_options[0], cost_usd: undefined, eta_days: undefined }} selected disabled />
          </div>
        </div>
      </Section>

      <Section id="dialog" title="ConfirmDialog" note="Native <dialog>: focus stays inside, Esc and backdrop cancel, focus returns to the opener.">
        <DialogDemo />
      </Section>

      <Section id="states" title="EmptyState, ErrorState and Skeleton">
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyState
            title="No open incidents"
            description="Nothing is projected to run out. New incidents show up here as orders are scored."
            action={
              <a href="#table" className={`${btn} border-white-800 bg-white text-black-400 hover:bg-white-300`}>
                View all incidents
              </a>
            }
          />
          <ErrorRetryDemo />
          <ErrorState />
          <div className="flex flex-col gap-6 rounded-xl border border-line-subtle bg-white p-4">
            <div>
              <Label>Skeleton lines=3</Label>
              <Skeleton lines={3} />
            </div>
            <div>
              <Label>Skeleton className=&quot;h-24 w-full&quot;</Label>
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </Section>

      <div className="flex flex-col gap-2">
        {page.map((i) => (
          <p key={i.incident_id} id={`incident-${i.incident_id}`} className="text-xs text-muted target:text-fg">
            Row link target #{i.incident_id}
          </p>
        ))}
      </div>
    </main>
  );
}
