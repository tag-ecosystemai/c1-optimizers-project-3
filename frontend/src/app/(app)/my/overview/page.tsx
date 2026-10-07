import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return (
    <>
      <PageHeader title="Overview" description="Your orders, your stock and anything that needs attention." />
      <EmptyState title="Nothing needs attention" description="Your orders in transit and products at risk will appear here." />
    </>
  );
}
