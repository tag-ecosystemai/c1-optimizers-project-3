import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "My stock" };

export default function Page() {
  return (
    <>
      <PageHeader title="My stock" description="Days of cover per product, lowest first." />
      <EmptyState title="No stock data yet" description="Your products and how long they will last will appear here." />
    </>
  );
}
