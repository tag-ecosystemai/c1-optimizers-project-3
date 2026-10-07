import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Watchtower" };

export default function Page() {
  return (
    <>
      <PageHeader title="Watchtower" description="What needs your attention right now, ranked by dollars at risk." />
      <EmptyState title="No incidents yet" description="The incident queue, KPIs and market breakdown will appear here." />
    </>
  );
}
