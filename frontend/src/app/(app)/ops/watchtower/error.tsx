"use client";

import { ErrorState } from "@/components/app/ErrorState";
import { PageHeader } from "@/components/app/PageHeader";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <>
      <PageHeader title="Watchtower" />
      <ErrorState title="We couldn't load the Watchtower" message="The incident queue or KPIs failed to load. Try again in a moment." onRetry={retry} />
    </>
  );
}
