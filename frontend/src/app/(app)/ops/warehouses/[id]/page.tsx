import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWarehouseInfo } from "@/lib/data";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/app/PageHeader";
import { PANEL } from "@/components/app/Panel";
import { ViewAsButton } from "@/components/network/ViewAsButton";

export const metadata: Metadata = { title: "Warehouse" };

export default async function Page({ params }: PageProps<"/ops/warehouses/[id]">) {
  const { id } = await params;
  const w = await getWarehouseInfo(Number(id));
  if (!w) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/ops/info", label: "Info" }}
        eyebrow={w.market}
        title={w.name}
        description={`The ${w.market} stock location. ${num(w.open_incidents)} open ${w.open_incidents === 1 ? "incident" : "incidents"}.`}
        actions={<ViewAsButton kind="warehouse" id={w.id} name={w.name} />}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <section className={PANEL}>
          <h2 className="mb-2 text-base text-fg">Who it serves</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {w.serves.map((d) => (
              <li key={d.id}>
                <Link href={`/ops/distributors/${d.id}`} className="text-blue-600 hover:underline">
                  {d.name}
                </Link>{" "}
                <span className="text-xs text-muted">· {d.segment}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={PANEL}>
          <h2 className="mb-2 text-base text-fg">Where its stock comes from</h2>
          <p className="mb-2 text-sm text-fg-2">{w.sources.note}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {w.sources.transfer_donors.map((o) => (
              <li key={o.id}>
                <Link href={`/ops/warehouses/${o.id}`} className="text-blue-600 hover:underline">
                  {o.name}
                </Link>{" "}
                <span className="text-xs text-muted">· {o.market}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {w.profile_doc && <p className="mt-4 text-xs text-muted">Market background: {w.profile_doc.title} ({w.profile_doc.doc_code}). Ask about it on the Ask page.</p>}
    </>
  );
}