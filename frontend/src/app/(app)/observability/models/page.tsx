import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return (
    <>
      <PageHeader title="Models" description="Champion models and recent training runs." />
      <EmptyState title="No model runs yet" description="M1 and M2 champions and recent runs will appear here." />
    </>
  );
}
