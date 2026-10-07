import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import type { DecisionListParams, DecisionLogItem, Page as DataPage } from "@/types/api";
import { listDecisions } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { FilterBar } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { Skeleton } from "@/components/app/Skeleton";
import { StatusPill } from "@/components/app/StatusPill";
import { ACTIONS, historyParams } from "./params";

export const metadata: Metadata = { title: "History" };


const columns: Column<DecisionLogItem>[] = [
  { key: "date", header: "Date", cell: (d) => <span className="block min-w-24">{dateTime(d.decided_at)}</span> },
  {
    key: "incident",
    header: "Incident",
    cell: (d) => (
      <Link
        href={`/ops/incidents/${d.incident_id}`}
        className="flex flex-col rounded-sm font-medium whitespace-nowrap text-fg hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        #{d.incident_id}
        <span className="text-xs font-normal text-muted">Order #{d.order_id}</span>
      </Link>
    ),
  },
  { key: "action", header: "Action", cell: (d) => <StatusPill status={d.action} /> },
  { key: "option", header: "Option chosen", hideBelow: "md", cell: (d) => d.option_title ?? <span className="text-muted">—</span> },
  { key: "by", header: "Decided by", hideBelow: "sm", cell: (d) => <span className="whitespace-nowrap">{d.by}</span> },
  { key: "note", header: "Note", hideBelow: "lg", cell: (d) => (d.note ? <span className="line-clamp-2 min-w-48">{d.note}</span> : <span className="text-muted">—</span>) },
  { key: "outcome", header: "Outcome", hideBelow: "md", cell: (d) => <StatusPill status={d.outcome} /> },
];

const btn =
  "inline-flex h-9 items-center rounded-[10px] border border-white-800 bg-white px-3 text-sm text-black-400 transition-colors hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

export default async function Page({ searchParams }: PageProps<"/ops/history">) {
  const sp = await searchParams;
  const params = historyParams((k) => sp[k]);
  const exportQuery = new URLSearchParams(Object.entries({ action: params.action, from: params.from, to: params.to }).filter((e): e is [string, string] => !!e[1]));
  return (
    <>
      <PageHeader
        title="History"
        description="Every decision on every incident, newest first."
        actions={
          <a href={`/ops/history/export${exportQuery.size ? `?${exportQuery}` : ""}`} download className={btn}>
            Export CSV
          </a>
        }
      />
      <FilterBar
        filters={[
          { param: "action", label: "Action", options: ACTIONS.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) })) },
          { param: "from", label: "From", kind: "date" },
          { param: "to", label: "To", kind: "date" },
        ]}
      />
      <Suspense fallback={<Skeleton rows={8} />}>
        <Decisions params={params} />
      </Suspense>
    </>
  );
}

async function Decisions({ params }: { params: DecisionListParams }) {
  let page: DataPage<DecisionLogItem>;
  try {
    page = await listDecisions(params);
  } catch (e) {
    unstable_rethrow(e);
    return <ErrorState message="We couldn't load the decision log. Try again in a moment." />;
  }
  const filtered = !!(params.action || params.from || params.to);
  return (
    <>
      <DataTable
        caption="Decision log"
        columns={columns}
        rows={page.items}
        rowKey={(d) => d.decision_id}
        empty={
          <EmptyState
            title={filtered ? "No decisions match" : "No decisions yet"}
            description={filtered ? "Try another action or date range." : "Approvals, dismissals, escalations and acknowledgements will be listed here."}
          />
        }
      />
      {page.items.length > 0 && <Pagination nextCursor={page.next_cursor} prevCursor={page.prev_cursor} count={page.items.length} total={page.total} />}
    </>
  );
}
