import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import type { NetworkWarehouse } from "@/types/api";
import { getOpsNetwork } from "@/lib/data";
import { num, usd } from "@/lib/format";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/app/Skeleton";
import { NetworkMap } from "@/components/network/NetworkMap";
import { ViewAsButton } from "@/components/network/ViewAsButton";

export const metadata: Metadata = { title: "Network" };

export default function Page() {
  return (
    <>
      <PageHeader title="Network" description="Five warehouses and the distributors they serve. Use View as to see exactly what one of them sees." />
      <Suspense
        fallback={
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <Skeleton rows={5} />
            <Skeleton className="h-80 w-full" />
          </div>
        }
      >
        <Network />
      </Suspense>
    </>
  );
}

function Stats({ open, money, lowCover }: { open: number; money?: number; lowCover?: number }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <div className="flex gap-1">
        <dt>Open incidents</dt>
        <dd className={`tabular-nums ${open ? "font-medium text-risk-high" : "text-fg-2"}`}>{num(open)}</dd>
      </div>
      {money !== undefined && (
        <div className="flex gap-1">
          <dt>At risk</dt>
          <dd className="text-fg-2 tabular-nums">{usd(money)}</dd>
        </div>
      )}
      {lowCover !== undefined && (
        <div className="flex gap-1">
          <dt>Low-cover SKUs</dt>
          <dd className="text-fg-2 tabular-nums">{num(lowCover)}</dd>
        </div>
      )}
    </dl>
  );
}

async function Network() {
  let network: NetworkWarehouse[];
  try {
    network = await getOpsNetwork();
  } catch (e) {
    unstable_rethrow(e);
    return <ErrorState message="We couldn't load the network. Try again in a moment." />;
  }
  if (!network.length) return <EmptyState title="No warehouses yet" description="Warehouses and their distributors will appear here once the network is set up." />;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <ul className="flex flex-col gap-3">
        {network.map((n) => (
          <li key={n.warehouse.id} className="rounded-xl border border-line-subtle bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-xs text-muted">{n.warehouse.market}</p>
                <h2 className="text-base text-fg">{n.warehouse.name}</h2>
                <Stats open={n.open_incidents} money={n.money_at_risk_usd} lowCover={n.low_cover_skus} />
              </div>
              <ViewAsButton kind="warehouse" id={n.warehouse.id} name={n.warehouse.name} />
            </div>
            <details className="group border-t border-line-faint">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm text-fg-2 hover:bg-surface focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
                {n.distributors.length} distributors
                <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none">
                  ▾
                </span>
              </summary>
              {n.distributors.length === 0 ? (
                <p className="px-4 pb-3 text-sm text-muted">No distributors are served by this warehouse.</p>
              ) : (
                <ul className="divide-y divide-line-faint border-t border-line-faint">
                  {n.distributors.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-sm text-fg">
                          {d.name} <span className="text-xs text-muted">· {d.segment}</span>
                        </p>
                        <Stats open={d.open_incidents} money={d.money_at_risk_usd} lowCover={d.low_cover_skus} />
                      </div>
                      <ViewAsButton kind="distributor" id={d.id} name={d.name} />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ul>
      <div className="max-sm:hidden xl:sticky xl:top-20">
        <NetworkMap network={network} />
      </div>
    </div>
  );
}
