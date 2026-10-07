import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Network" };

export default function Page() {
  return (
    <>
      <PageHeader title="Network" description="Five warehouses and the distributors they serve." />
      <EmptyState title="Network view coming soon" description="Warehouse cards with their distributors will appear here." />
    </>
  );
}
