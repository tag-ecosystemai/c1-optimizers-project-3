import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { KpiCard } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/app/Skeleton";
import { card, ExternalLink, LoadError, load, Section, StatusTag, Tag } from "@/components/observability/shared";
import { getObservability } from "@/lib/data";
import { date, num } from "@/lib/format";
import type { HubLinkKey } from "@/types/api";

export const metadata: Metadata = { title: "Observability" };

const ORDER: HubLinkKey[] = ["langfuse", "dagshub", "grafana", "supabase"];

export default function Page() {
  return (
    <>
      <PageHeader title="Observability" description="Models, data and agent health in one place." />
      <Suspense fallback={<HubSkeleton />}>
        <Hub />
      </Suspense>
    </>
  );
}

async function Hub() {
  const hub = await load(getObservability);
  if (!hub) return <LoadError what="the observability hub" />;
  const { summary } = hub;
  const trained = Object.values(summary.models_trained).filter((s) => s === "active").length;
  const links = ORDER.filter((k) => hub.links[k]).map((k) => ({ key: k, ...hub.links[k] }));
  const allOk = hub.status === "all_systems_operational";

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Summary"
        description={`Last updated ${date(hub.last_updated)}`}
        actions={<Tag tone={allOk ? "good" : "warn"}>{allOk ? "All systems operational" : hub.status.replaceAll("_", " ")}</Tag>}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total orders" value={num(summary.total_orders)} />
          <KpiCard label="Predictions" value={num(summary.total_predictions)} />
          <KpiCard label="Active incidents" value={num(summary.active_incidents)} />
          <KpiCard
            label="Models trained"
            value={`${trained} of ${Object.keys(summary.models_trained).length}`}
            hint={Object.entries(summary.models_trained)
              .map(([k, s]) => `${k.toUpperCase()} ${s}`)
              .join(" · ")}
          />
        </div>
      </Section>

      <Section title="Tools" description="Open the tool you need. Not configured means the link has no credentials yet.">
        {links.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {links.map((l) => (
              <li key={l.key} className={`${card} flex flex-col gap-2`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-fg">{l.label}</h3>
                  <StatusTag status={l.status} />
                </div>
                <p className="text-sm text-muted">{l.description}</p>
                <ExternalLink href={l.url}>Open {l.label}</ExternalLink>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No tools linked" description="The API returned no observability links." />
        )}
      </Section>
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["Total orders", "Predictions", "Active incidents", "Models trained"].map((l) => (
          <KpiCard key={l} label={l} value="" loading />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ORDER.map((k) => (
          <Skeleton key={k} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
