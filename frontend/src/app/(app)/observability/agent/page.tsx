import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { type Column, DataTable } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { KpiCard } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/app/Skeleton";
import { ToolCallChart } from "@/components/observability/Charts";
import { card, ExternalLink, LoadError, load, Section, StatusTag } from "@/components/observability/shared";
import { requireSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/routes";
import { getAgentStats } from "@/lib/data";
import { dateTime, num, percent, usd } from "@/lib/format";
import type { AgentStats } from "@/types/api";

export const metadata: Metadata = { title: "Agent" };

export default function Page() {
  return (
    <>
      <PageHeader title="Agent" description="Agent runs, latency, cost and errors." />
      <Suspense fallback={<AgentSkeleton />}>
        <Agent />
      </Suspense>
    </>
  );
}

type Investigation = AgentStats["recent"][number];

function recentColumns(incidentHref: (id: number) => string | null): Column<Investigation>[] {
  return [
    {
      key: "incident",
      header: "Incident",
      cell: (r) => {
        const href = incidentHref(r.incident_id);
        // The data role can't open ops pages, so the id is plain text unless this viewer may follow it.
        return href ? (
          <Link href={href} className="font-medium text-blue-600 hover:underline">
            #{r.incident_id}
          </Link>
        ) : (
          <span className="font-medium text-fg">#{r.incident_id}</span>
        );
      },
    },
    { key: "order", header: "Order", cell: (r) => `#${r.order_id}`, hideBelow: "sm" },
    { key: "cause", header: "Probable cause", cell: (r) => r.probable_cause ?? <span className="text-muted">Still investigating</span>, className: "min-w-40" },
    { key: "status", header: "Status", cell: (r) => <StatusTag status={r.status} /> },
    { key: "latency", header: "Latency", cell: (r) => `${r.latency_s.toFixed(1)} s`, align: "right", hideBelow: "md" },
    { key: "cost", header: "Cost", cell: (r) => usd(r.cost_usd), align: "right", hideBelow: "md" },
    { key: "at", header: "Investigated", cell: (r) => <span className="whitespace-nowrap">{dateTime(r.investigated_at)}</span>, hideBelow: "lg" },
  ];
}

async function Agent() {
  const [s, session] = await Promise.all([load(getAgentStats), requireSession()]);
  if (!s) return <LoadError what="the agent stats" />;
  const incidentHref = (id: number) => {
    const href = `/ops/incidents/${id}`;
    return canAccess(href, session.role, session.viewAs) ? href : null;
  };
  const tools = [...s.tool_calls].sort((a, b) => b.count - a.count);
  const toolTotal = tools.reduce((n, t) => n + t.count, 0);

  return (
    <div className="flex flex-col gap-8">
      <Section title={s.period} actions={s.traces_url ? <ExternalLink href={s.traces_url}>Open traces in Langfuse</ExternalLink> : undefined}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Agent runs" value={num(s.runs)} />
          <KpiCard label="Avg latency" value={`${s.avg_latency_s.toFixed(1)} s`} />
          <KpiCard label="Avg cost" value={usd(s.avg_cost_usd)} hint={`${usd(s.avg_cost_usd * s.runs)} in total`} />
          <KpiCard label="Error rate" value={percent(s.error_rate, 1)} hint={`${num(Math.round(s.error_rate * s.runs))} failed runs`} />
        </div>
      </Section>

      <Section title="Tool calls" description={`${num(toolTotal)} calls across ${num(s.runs)} runs.`}>
        <div className={card}>
          {tools.length ? (
            <>
              <ToolCallChart data={tools} />
              <ul className="sr-only">
                {tools.map((t) => (
                  <li key={t.name}>
                    {t.label}: {t.count}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState title="No tool calls yet" description="Tool usage appears after the agent's next run." />
          )}
        </div>
      </Section>

      <Section title="Recent investigations" description="Incidents the agent investigated. Incident pages live in the operations app.">
        <DataTable
          caption="Recent agent investigations"
          columns={recentColumns(incidentHref)}
          rows={s.recent}
          rowKey={(r) => `${r.incident_id}-${r.investigated_at}`}
          empty={<EmptyState title="No investigations yet" description="The agent investigates new incidents after each scoring run." />}
        />
      </Section>
    </div>
  );
}

function AgentSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["Agent runs", "Avg latency", "Avg cost", "Error rate"].map((l) => (
          <KpiCard key={l} label={l} value="" loading />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
      <Skeleton rows={5} />
    </div>
  );
}
