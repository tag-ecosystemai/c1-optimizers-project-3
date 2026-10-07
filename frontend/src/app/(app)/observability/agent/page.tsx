import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Agent" };

export default function Page() {
  return (
    <>
      <PageHeader title="Agent" description="Agent runs, latency, cost and errors." />
      <EmptyState title="No agent runs yet" description="Agent stats and recent investigations will appear here." />
    </>
  );
}
