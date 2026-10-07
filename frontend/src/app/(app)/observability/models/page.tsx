import type { Metadata } from "next";
import { Suspense } from "react";
import { type Column, DataTable } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/app/Skeleton";
import { MetricTrendChart } from "@/components/observability/Charts";
import { card, ExternalLink, LoadError, load, Section, StatusTag } from "@/components/observability/shared";
import { getModels } from "@/lib/data";
import { dateTime, num } from "@/lib/format";
import type { ModelRun, ModelSummary } from "@/types/api";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return (
    <>
      <PageHeader title="Models" description="Champion models and recent training runs." />
      <Suspense fallback={<ModelsSkeleton />}>
        <Models />
      </Suspense>
    </>
  );
}

async function Models() {
  const models = await load(getModels);
  if (!models) return <LoadError what="the models" />;
  if (!models.length) return <EmptyState title="No models yet" description="M1 and M2 appear here after their first training run." />;
  return (
    <div className="flex flex-col gap-10">
      {models.map((m) => (
        <ModelBlock key={m.key} model={m} />
      ))}
    </div>
  );
}

// Failed runs carry no metrics, so show a dash instead of a misleading 0.
const metric = (r: ModelRun, v: number) => (r.status === "failed" ? "—" : num(v, 2));

const columns: Column<ModelRun>[] = [
  { key: "version", header: "Version", cell: (r) => <span className="font-medium text-fg">{r.version}</span> },
  { key: "algorithm", header: "Algorithm", cell: (r) => r.algorithm, hideBelow: "md" },
  { key: "status", header: "Status", cell: (r) => <StatusTag status={r.status} /> },
  { key: "mae", header: "MAE", cell: (r) => metric(r, r.mae), align: "right" },
  { key: "rmse", header: "RMSE", cell: (r) => metric(r, r.rmse), align: "right", hideBelow: "sm" },
  { key: "r2", header: "R²", cell: (r) => metric(r, r.r2), align: "right", hideBelow: "sm" },
  { key: "trained", header: "Trained at", cell: (r) => <span className="whitespace-nowrap">{dateTime(r.trained_at)}</span>, hideBelow: "lg" },
  { key: "mlflow", header: "MLflow", cell: (r) => (r.mlflow_url ? <ExternalLink href={r.mlflow_url}>Run {r.run_id}</ExternalLink> : "—"), hideBelow: "md" },
];

function ModelBlock({ model }: { model: ModelSummary }) {
  const c = model.champion;
  const trend = model.runs
    .filter((r) => r.status !== "failed")
    .sort((a, b) => a.trained_at.localeCompare(b.trained_at))
    .map((r) => ({ label: r.version, value: r.mae }));

  return (
    <Section title={model.name} description={model.target}>
      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <div className={card}>
          {c ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-fg">Champion {c.version}</h3>
                <StatusTag status={c.status} />
              </div>
              <p className="text-sm text-muted">
                {c.algorithm} · trained {dateTime(c.trained_at)}
              </p>
              <dl className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["MAE", c.mae],
                    ["RMSE", c.rmse],
                    ["R²", c.r2],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface px-3 py-2">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="font-display text-xl text-fg tabular-nums">{num(v, 2)}</dd>
                  </div>
                ))}
              </dl>
              {c.mlflow_url && <ExternalLink href={c.mlflow_url}>Open run {c.run_id} in MLflow</ExternalLink>}
            </div>
          ) : (
            <EmptyState title="No champion yet" description="Promote a run in MLflow to make it the champion." />
          )}
        </div>
        <div className={card}>
          {trend.length > 1 ? (
            <MetricTrendChart points={trend} metric="MAE" />
          ) : (
            <EmptyState title="Not enough runs for a trend" description="The chart appears after two successful runs." />
          )}
        </div>
      </div>
      <DataTable
        caption={`Recent ${model.name} runs`}
        columns={columns}
        rows={model.runs}
        rowKey={(r) => r.run_id}
        empty={<EmptyState title="No runs yet" description="Training runs logged to MLflow appear here." />}
      />
    </Section>
  );
}

function ModelsSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      {[1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
          <Skeleton rows={3} />
        </div>
      ))}
    </div>
  );
}
