import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export const metadata: Metadata = { title: "Ask RunOut" };

export default function Page() {
  return (
    <>
      <PageHeader title="Ask RunOut" description="Ask about your warehouse's stock and incidents." />
      <EmptyState title="Ask is on its way" description="The agent chat will appear here." />
    </>
  );
}
