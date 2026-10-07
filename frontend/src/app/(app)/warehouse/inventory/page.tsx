import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand and days of cover per product." />
      <EmptyState title="No inventory yet" description="Your products and their days of cover will appear here." />
    </>
  );
}
