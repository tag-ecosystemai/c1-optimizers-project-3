import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { AskPanel } from "@/components/ask/AskPanel";
import { getIncident } from "@/lib/data";

export const metadata: Metadata = { title: "Ask RunOut" };

const STARTERS = ["Which incidents in LATAM are highest risk this week?", "Why is order 55123 delayed?", "Which warehouse has spare stock of cardio equipment?"];
const INCIDENT_STARTERS = ["Why is this order late?", "What do you recommend, and what does it cost?", "Who is affected if we do nothing?"];

/** `?incident=<id>` (linked from incident detail) opens the chat with that incident as context. */
export default async function Page({ searchParams }: { searchParams: Promise<{ incident?: string }> }) {
  const id = Number((await searchParams).incident);
  const incident = Number.isInteger(id) && id > 0 ? await getIncident(id) : null;

  return (
    <>
      <PageHeader
        title="Ask RunOut"
        description={
          incident
            ? `About incident #${incident.incident_id}: order #${incident.order.order_id}, ${incident.product.name}.`
            : "Ask the agent about any market, order or incident."
        }
        back={incident ? { href: `/ops/incidents/${incident.incident_id}`, label: `Incident #${incident.incident_id}` } : undefined}
      />
      <AskPanel
        key={incident?.incident_id ?? "all"}
        incidentId={incident?.incident_id}
        starters={incident ? INCIDENT_STARTERS : STARTERS}
        note="Full access to every market."
        placeholder="Ask about any market, order or incident…"
      />
    </>
  );
}
