import type { Metadata } from "next";
import { Suspense } from "react";
import { type Column, DataTable } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { KpiCard } from "@/components/app/KpiCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/app/Skeleton";
import { load } from "@/lib/load";
import { LoadError } from "@/components/app/LoadError";
import { Tag } from "@/components/app/Tag";
import { Section } from "@/components/app/Panel";
import { StatusTag } from "@/components/observability/shared";
import { asOfDate, getPipeline } from "@/lib/data";
import { date, dateTime, num, relativeToAsOf } from "@/lib/format";
import type { PipelineStage, PipelineStatus } from "@/types/api";

export const metadata: Metadata = { title: "Pipeline" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pipeline" description="Last run, row counts and data freshness per stage." />
      <Suspense fallback={<PipelineSkeleton />}>
        <Pipeline />
      </Suspense>
    </>
  );
}

type FailedRun = PipelineStatus["failed_runs"][number];
type Drift = PipelineStatus["drift_flags"][number];

const stageColumns: Column<PipelineStage>[] = [
  { key: "name", header: "Stage", cell: (s) => <span className="font-medium text-fg">{s.name}</span> },
  { key: "status", header: "Status", cell: (s) => <StatusTag status={s.status} /> },
  { key: "rows", header: "Rows", cell: (s) => num(s.rows), align: "right" },
  { key: "duration", header: "Duration", cell: (s) => (s.duration_s === null ? "—" : `${num(s.duration_s)} s`), align: "right", hideBelow: "sm" },
  { key: "last", header: "Last run", cell: (s) => (s.last_run_at ? <span className="whitespace-nowrap">{dateTime(s.last_run_at)}</span> : "Never"), hideBelow: "md" },
];

const failedColumns: Column<FailedRun>[] = [
  { key: "run", header: "Run", cell: (r) => <span className="font-medium whitespace-nowrap text-fg">{r.run_id}</span> },
  { key: "stage", header: "Stage", cell: (r) => r.stage },
  { key: "at", header: "Failed at", cell: (r) => <span className="whitespace-nowrap">{dateTime(r.failed_at)}</span>, hideBelow: "md" },
  { key: "error", header: "Error", cell: (r) => r.error, className: "min-w-48" },
];

const driftColumns: Column<Drift>[] = [
  { key: "feature", header: "Feature", cell: (d) => <code className="text-xs break-all text-fg">{d.feature}</code> },
  { key: "metric", header: "Metric", cell: (d) => d.metric, hideBelow: "sm" },
  { key: "value", header: "Value", cell: (d) => `${num(d.value, 2)} / ${num(d.threshold, 2)}`, align: "right", className: "whitespace-nowrap" },
  { key: "flag", header: "Flag", cell: (d) => (d.flagged ? <Tag tone="warn">Drifting</Tag> : <Tag tone="good">Stable</Tag>) },
];

async function Pipeline() {
  const [p, asOf] = await Promise.all([load(getPipeline), load(asOfDate)]);
  if (!p) return <LoadError what="the pipeline status" />;
  const flagged = p.drift_flags.filter((d) => d.flagged).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Last run" value={<StatusTag status={p.status} />} hint={dateTime(p.last_run_at)} />
        <KpiCard label="Latest order date" value={date(p.freshness.max_order_date)} hint={asOf ? relativeToAsOf(p.freshness.max_order_date, asOf) : undefined} />
        <KpiCard label="Last scored" value={date(p.freshness.max_scored_at)} hint={dateTime(p.freshness.max_scored_at)} />
        <KpiCard label="Drift flags" value={num(flagged)} hint={`of ${p.drift_flags.length} features checked`} />
      </div>

      <Section title="Stages" description="Seed → features → scoring → cascade, in run order.">
        <DataTable caption="Pipeline stages" columns={stageColumns} rows={p.stages} rowKey={(s) => s.key} empty={<EmptyState title="No stages reported" description="The pipeline hasn't run yet." />} />
      </Section>

      <Section title="Failed runs">
        <DataTable caption="Failed pipeline runs" columns={failedColumns} rows={p.failed_runs} rowKey={(r) => r.run_id} empty={<EmptyState title="No failed runs" description="Every recent pipeline run finished." />} />
      </Section>

      <Section title="Drift and null-rate flags" description="Value against threshold; flagged when the value is above it.">
        <DataTable caption="Feature drift" columns={driftColumns} rows={p.drift_flags} rowKey={(d) => d.feature} empty={<EmptyState title="No drift checks yet" description="Drift metrics appear after the next scoring run." />} />
      </Section>
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["Last run", "Latest order date", "Last scored", "Drift flags"].map((l) => (
          <KpiCard key={l} label={l} value="" loading />
        ))}
      </div>
      <Skeleton rows={4} />
      <Skeleton rows={2} />
    </div>
  );
}
