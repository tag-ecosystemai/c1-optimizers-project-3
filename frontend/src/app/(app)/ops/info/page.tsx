import type { Metadata } from "next";
import Link from "next/link";
import { getOpsNetwork } from "@/lib/data";
import { load } from "@/lib/load";
import { PageHeader } from "@/components/app/PageHeader";
import { PANEL } from "@/components/app/Panel";

export const metadata: Metadata = { title: "Info" };

const SEES = [
  "Watchtower: every open incident across all warehouses, ranked by dollars at risk.",
  "Incident detail: impact, affected orders, the agent's briefing, probable cause and evidence, recommended options, and why the model expects a delay.",
  "Network: the five warehouses and the distributors they supply.",
  "History: every decision made, with export.",
];
const CAN = [
  "Approve a recommended option, dismiss an incident with a note, or escalate it.",
  "Upload policy documents on the Knowledge page so Ask can answer from them.",
  "Ask questions about incidents, orders and policy.",
  "View as any warehouse or distributor to check what they see.",
];
const CANNOT = [
  "Acknowledge an incident (the warehouse does that).",
  "Approve spend above your limit; it must be escalated (RO-OPS-002).",
  "See the Observability pages (data team only).",
];

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className={PANEL}>
      <h2 className="mb-2 text-base text-fg">{title}</h2>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-fg-2">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function Page() {
  const network = await load(getOpsNetwork);
  return (
    <>
      <PageHeader title="Info" description="Your role in RunOut, and who is in the network." />

      <section className={`${PANEL} mb-4`}>
        <h2 className="mb-1 text-base text-fg">Operations Manager</h2>
        <p className="text-sm text-fg-2">
          You watch for stock shortages that will delay distributor orders, decide how to respond, and keep the warehouses and distributors informed.
          An incident is one product running short at one warehouse; it can affect many orders from many distributors.
        </p>
      </section>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <List title="What you see" items={SEES} />
        <List title="What you can do" items={CAN} />
        <List title="What you can't do" items={CANNOT} />
      </div>

      <section className={`${PANEL} mb-6`}>
        <h2 className="mb-1 text-base text-fg">How the network works</h2>
        <p className="text-sm text-fg-2">
          <strong>Warehouses</strong> hold RunOut's stock: one per market. <strong>Distributors</strong> are RunOut's customers: they order from the
          warehouse in their market. A distributor's segment (Consumer, Corporate or Home Office) is the type of end customer it serves.
          When a warehouse runs short, stock can be transferred in from another warehouse.
        </p>
      </section>

      <section aria-labelledby="dir-title">
        <h2 id="dir-title" className="mb-3 text-base text-fg">
          Warehouses and distributors
        </h2>
        {!network ? (
          <p className="text-sm text-muted">Couldn't load the network.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {network.map((n) => (
              <div key={n.warehouse.id} className={PANEL}>
                <p className="text-xs text-muted">{n.warehouse.market}</p>
                <Link href={`/ops/warehouses/${n.warehouse.id}`} className="text-base text-blue-600 hover:underline">
                  {n.warehouse.name}
                </Link>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {n.distributors.map((d) => (
                    <li key={d.id}>
                      <Link href={`/ops/distributors/${d.id}`} className="text-fg-2 hover:underline">
                        {d.name}
                      </Link>{" "}
                      <span className="text-xs text-muted">· {d.segment}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}