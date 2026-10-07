import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "History" };

export default function Page() {
  return (
    <>
      <PageHeader title="History" description="Every decision on every incident." />
      <EmptyState title="No decisions yet" description="Approvals, dismissals and escalations will be listed here." />
    </>
  );
}
