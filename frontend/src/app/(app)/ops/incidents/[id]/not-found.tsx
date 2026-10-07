import Link from "next/link";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";

export default function NotFound() {
  return (
    <>
      <PageHeader back={{ href: "/ops/watchtower", label: "Watchtower" }} title="Incident not found" />
      <EmptyState
        title="This incident doesn't exist"
        description="It may have been resolved and archived, or the link is wrong."
        action={
          <Link href="/ops/watchtower" className="text-sm underline">
            Back to the queue
          </Link>
        }
      />
    </>
  );
}
