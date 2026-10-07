"use client";

import { ErrorState } from "@/components/app/ErrorState";
import { PageHeader } from "@/components/app/PageHeader";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <>
      <PageHeader back={{ href: "/ops/watchtower", label: "Watchtower" }} title="Incident" />
      <ErrorState title="We couldn't load this incident" message="Try again in a moment." onRetry={retry} />
    </>
  );
}
