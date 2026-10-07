import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "My orders" };

export default function Page() {
  return (
    <>
      <PageHeader title="My orders" description="Every order with its predicted arrival." />
      <EmptyState title="No orders yet" description="Your orders will appear here." />
    </>
  );
}
