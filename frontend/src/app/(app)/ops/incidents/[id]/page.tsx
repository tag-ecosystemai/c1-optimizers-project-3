import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { asOfDate, getIncident } from "@/lib/data";
import { date, dateTime, days, num, percent, usd } from "@/lib/format";
import { CoverBar } from "@/components/app/CoverBar";
import { EmptyState } from "@/components/app/EmptyState";
import { EvidenceList } from "@/components/app/EvidenceList";
import { PageHeader } from "@/components/app/PageHeader";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { ShapChart } from "@/components/app/ShapChart";
import { StatusPill } from "@/components/app/StatusPill";
import { AutoRefresh } from "@/components/ops/AutoRefresh";
import { DecisionBar, DecisionProvider, OptionPicker } from "@/components/ops/Decision";

export async function generateMetadata({ params }: PageProps<"/ops/incidents/[id]">): Promise<Metadata> {
  return { title: `Incident #${(await params).id}` };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line-faint pt-6">
      <h2 className="text-base text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, danger }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-sm tabular-nums ${danger ? "font-medium text-risk-high" : "text-fg"}`}>{value}</dd>
    </div>
  );
}

const askLink =
  "inline-flex h-9 items-center rounded-[10px] border border-white-800 bg-white px-3 text-sm text-black-400 hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

export default async function Page({ params }: PageProps<"/ops/incidents/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [incident, today] = await Promise.all([getIncident(id), asOfDate()]);
  if (!incident) notFound();

  const { cascade: c, decisions = [], recommended_options: options = [] } = incident;
  const investigating = incident.probable_cause === null;
  const optionTitle = (oid?: string | null) => options.find((o) => o.option_id === oid)?.title;

  return (
    <DecisionProvider incidentId={incident.incident_id} status={incident.status} options={options}>
      {investigating && <AutoRefresh seconds={10} />}
      <PageHeader
        back={{ href: "/ops/watchtower", label: "Watchtower" }}
        eyebrow={
          <>
            <span>Incident #{incident.incident_id}</span>
            <SeverityBadge severity={incident.severity} />
            <StatusPill status={incident.status} />
          </>
        }
        title={`Order #${incident.order.order_id}: ${incident.product.name}`}
        description={
          <>
            {incident.distributor && `${incident.distributor.name} · ${incident.distributor.market}`}
            {incident.warehouse && ` · from ${incident.warehouse.name}`}
            {incident.created_at && ` · opened ${dateTime(incident.created_at)}`}
          </>
        }
        actions={
          <Link href={`/ops/ask?incident=${incident.incident_id}`} className={askLink}>
            Ask about this incident
          </Link>
        }
      />

      <div className="flex flex-col gap-6">
        <section aria-labelledby="impact-title" className="flex flex-col gap-4 rounded-xl border border-line-subtle p-4 md:p-5">
          <h2 id="impact-title" className="text-base text-fg">
            Impact
          </h2>
          <CoverBar asOfDate={today} cover={c} />
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Predicted delay" value={days(c.predicted_delay_days)} />
            <Stat label="Projected arrival" value={date(c.projected_arrival)} />
            <Stat label="Stockout date" value={date(c.stockout_date)} danger />
            <Stat label="Days of cover" value={days(c.days_of_cover)} />
            <Stat label="Units short" value={num(c.units_short)} danger={c.units_short > 0} />
            {c.money_at_risk_usd !== undefined && <Stat label="$ at risk" value={usd(c.money_at_risk_usd)} danger />}
          </dl>
        </section>

        <Section title="Why this is happening">
          {investigating ? (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <span aria-hidden="true" className="size-2.5 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none" />
              Investigation in progress… The agent is checking news, weather and route data. This page updates on its own.
            </div>
          ) : (
            <>
              <p className="text-sm text-fg">
                <span className="font-medium">{incident.probable_cause}</span>
                {incident.cause_confidence != null && <span className="text-muted"> · {percent(incident.cause_confidence)} confidence</span>}
              </p>
              {incident.evidence?.length ? <EvidenceList items={incident.evidence} /> : <p className="text-sm text-muted">No supporting evidence recorded.</p>}
            </>
          )}
        </Section>

        {incident.shap && incident.shap.length > 0 && (
          <Section title="Why the model thinks it's late">
            <ShapChart factors={incident.shap} riskScore={c.delay_risk_score} />
          </Section>
        )}

        <Section title="Recommended options">
          {options.length ? (
            <OptionPicker />
          ) : (
            <EmptyState title={investigating ? "Options are on the way" : "No options"} description={investigating ? "The agent drafts options once the investigation finishes." : "The agent did not recommend any action for this incident."} />
          )}
        </Section>

        {incident.briefing_text && (
          <Section title="Briefing">
            <p className="max-w-3xl text-sm leading-6 whitespace-pre-line text-fg-2">{incident.briefing_text}</p>
          </Section>
        )}

        <Section title="Activity">
          {decisions.length ? (
            <ol className="flex flex-col divide-y divide-line-faint rounded-xl border border-line-subtle">
              {[...decisions].reverse().map((d, i) => (
                <li key={d.decision_id ?? i} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-3">
                  <StatusPill status={d.action} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm text-fg">
                      {d.by}
                      {optionTitle(d.selected_option_id) && <span className="text-fg-2"> · {optionTitle(d.selected_option_id)}</span>}
                    </p>
                    {d.note && <p className="text-sm text-fg-2">“{d.note}”</p>}
                    <p className="text-xs text-muted">{dateTime(d.decided_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No decisions yet.</p>
          )}
        </Section>
      </div>

      <DecisionBar />
    </DecisionProvider>
  );
}
