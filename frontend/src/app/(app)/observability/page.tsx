import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Observability" };

export default function Page() {
  return (
    <>
      <PageHeader title="Observability" description="Models, data and agent health in one place." />
      <EmptyState title="Hub coming soon" description="Links to Langfuse, MLflow, Grafana and Supabase will appear here." />
    </>
  );
}
