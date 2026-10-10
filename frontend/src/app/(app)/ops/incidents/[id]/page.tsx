import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { asOfDate, getIncident, getIncidentGuidance } from "@/lib/data";
import { date, dateTime, days, num, percent, usd } from "@/lib/format";
import { load } from "@/lib/load";
import { CoverBar } from "@/components/app/CoverBar";
import { EmptyState } from "@/components/app/EmptyState";
import { EvidenceList } from "@/components/app/EvidenceList";
import { PageHeader } from "@/components/app/PageHeader";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { ShapChart } from "@/components/app/ShapChart";
import { StatusPill } from "@/components/app/StatusPill";
import { AutoRefresh } from "@/components/ops/AutoRefresh";
import { DecisionBar, DecisionProvider, OptionPicker } from "@/components/ops/Decision";
import { Briefing } from "@/components/app/Briefing";

export async function generateMetadata({ params }: PageProps<"/ops/incidents/[id]">): Promise<Metadata> {
  return { title: `Incident #${(await params).id}` };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line-faint pt-6">
      <div>
        <h2 className="text-base text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
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
  const [incident, today, guidance] = await Promise.all([getIncident(id), asOfDate(), load(() => getIncidentGuidance(id))]);
  if (!incident) notFound();

  // The API sends null (not undefined) for things not ready yet, so use ?? and not destructuring defaults.
  const c = incident.impact;
  const decisions = incident.decisions ?? [];
  const options = incident.recommended_options ?? [];
  const orders = incident.affected_orders ?? [];
  const evidence = incident.evidence ?? [];
  const factors = incident.shap?.top_features ?? [];
  const riskScore = incident.shap?.delay_risk_score ?? undefined;
  const investigating = !incident.probable_cause;
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
        title={`${incident.product.name} at ${incident.warehouse?.name ?? "warehouse"}`}
        description={
          <>
            {num(orders.length)} {orders.length === 1 ? "order" : "orders"} affected
            {incident.warehouse?.market && ` · ${incident.warehouse.market}`}
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
          {c.stockout_date && c.first_arrival && (
            <CoverBar
              asOfDate={today}
              cover={
                {
                  days_of_cover: c.days_of_cover ?? 0,
                  stockout_date: c.stockout_date,
                  projected_arrival: c.first_arrival,
                  first_arrival: c.first_arrival,
                  units_short: c.units_short,
                } as never
              }
            />
          )}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Stockout date" value={c.stockout_date ? date(c.stockout_date) : "—"} danger />
            <Stat label="Next stock arrives" value={c.first_arrival ? date(c.first_arrival) : "—"} />
            <Stat label="Gap" value={c.gap_days != null ? days(c.gap_days) : "—"} danger={(c.gap_days ?? 0) > 0} />
            <Stat label="Days of cover" value={c.days_of_cover != null ? days(c.days_of_cover) : "—"} />
            <Stat label="Units short" value={num(c.units_short)} danger={c.units_short > 0} />
            {c.money_at_risk_usd !== undefined && <Stat label="$ at risk" value={usd(c.money_at_risk_usd)} danger />}
          </dl>
        </section>

        <Section title="Agent briefing" hint="Written by the agent from the numbers above. The figures come from code; the model only words the summary.">
          {incident.briefing_text ? (
            <Briefing text={incident.briefing_text} />
          ) : (
            <p className="text-sm text-muted">{investigating ? "The briefing appears once the agent has analysed this incident." : "No briefing recorded."}</p>
          )}
        </Section>

        <Section title="What the agent found" hint="It checks weather and news near the market's hubs, and how late each shipping mode has been running.">
          {investigating ? (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <span aria-hidden="true" className="size-2.5 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none" />
              Awaiting analysis. The agent hasn't looked at this incident yet. This page updates on its own.
            </div>
          ) : (
            <>
              <p className="text-sm text-fg">
                <span className="font-medium">{incident.probable_cause}</span>
                {incident.cause_confidence != null && <span className="text-muted"> · {percent(incident.cause_confidence)} confidence</span>}
              </p>
              {evidence.length ? <EvidenceList items={evidence} /> : <p className="text-sm text-muted">No supporting evidence recorded.</p>}
            </>
          )}
        </Section>

        <Section title="Recommended options" hint="Options are built from the policies (RO-OPS-002, 004, 005). The agent picks one and explains why; you decide.">
          {options.length ? (
            <OptionPicker />
          ) : (
            <EmptyState
              title={investigating ? "Options are on the way" : "No options"}
              description={investigating ? "The agent drafts options once it has analysed the incident." : "The agent did not recommend any action for this incident."}
            />
          )}
        </Section>

        {factors.length > 0 && (
          <Section title="Why the model thinks orders will be late" hint="Shown for the most at-risk order. Red adds delay, green reduces it.">
            <ShapChart factors={factors} riskScore={riskScore} />
          </Section>
        )}

        <Section title="Policy guidance" hint="Passages from RunOut's policies and procedures that apply to this kind of incident. Upload more on the Knowledge page.">
          {guidance && guidance.length ? (
            <ul className="flex flex-col divide-y divide-line-faint rounded-xl border border-line-subtle bg-white">
              {guidance.map((g) => (
                <li key={`${g.doc_code}-${g.section}`} className="flex flex-col gap-1 p-3">
                  <p className="text-sm text-fg">
                    {g.title}{" "}
                    <span className="text-xs text-muted">
                      {g.doc_code}
                      {g.section ? ` · ${g.section}` : ""}
                    </span>
                  </p>
                  <p className="text-sm text-fg-2">{g.snippet}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No matching policy passages were found for this incident.</p>
          )}
        </Section>

        <Section title={`Affected orders (${orders.length})`}>
          {orders.length ? (
            <div className="overflow-x-auto rounded-xl border border-line-subtle">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-normal">Order</th>
                    <th className="px-3 py-2 font-normal">Distributor</th>
                    <th className="px-3 py-2 text-right font-normal">Qty</th>
                    <th className="px-3 py-2 text-right font-normal">Units short</th>
                    <th className="px-3 py-2 text-right font-normal">Predicted delay</th>
                    <th className="px-3 py-2 font-normal">Projected arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-faint">
                  {orders.map((o) => (
                    <tr key={o.order_id}>
                      <td className="px-3 py-2 tabular-nums">#{o.order_id}</td>
                      <td className="px-3 py-2">{o.distributor?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(o.quantity)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(o.units_short)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{o.predicted_delay_days != null ? days(o.predicted_delay_days) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{o.projected_arrival ? date(o.projected_arrival) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No orders listed.</p>
          )}
        </Section>

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