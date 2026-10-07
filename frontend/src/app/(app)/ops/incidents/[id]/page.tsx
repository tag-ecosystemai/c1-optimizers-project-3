import type { Metadata } from "next";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export async function generateMetadata({ params }: PageProps<"/ops/incidents/[id]">): Promise<Metadata> {
  return { title: `Incident #${(await params).id}` };
}

export default async function Page({ params }: PageProps<"/ops/incidents/[id]">) {
  const { id } = await params;
  return (
    <>
      <PageHeader back={{ href: "/ops/watchtower", label: "Watchtower" }} title={`Incident #${id}`} />
      <EmptyState title="Incident detail coming soon" description="Impact, cause, options and the decision bar will appear here." />
    </>
  );
}
