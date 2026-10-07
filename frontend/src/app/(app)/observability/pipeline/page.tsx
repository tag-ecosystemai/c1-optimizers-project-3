import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Pipeline" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pipeline" description="Last run, row counts and data freshness per stage." />
      <EmptyState title="No pipeline runs yet" description="Stage status and freshness will appear here." />
    </>
  );
}
