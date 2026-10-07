import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Warehouse overview" };

export default function Page() {
  return (
    <>
      <PageHeader title="Warehouse overview" description="Stock running thin and the distributors it affects." />
      <EmptyState title="Nothing to show yet" description="KPIs and the distributors you serve will appear here." />
    </>
  );
}
