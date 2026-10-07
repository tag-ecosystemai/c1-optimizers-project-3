import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Incidents" };

export default function Page() {
  return (
    <>
      <PageHeader title="Incidents" description="Incidents in your warehouse." />
      <EmptyState title="No incidents yet" description="Incidents for your warehouse will appear here." />
    </>
  );
}
