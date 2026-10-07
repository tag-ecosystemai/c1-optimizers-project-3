"use client";

import { ErrorState } from "@/components/app/ErrorState";

/** Shared body for the error.tsx boundaries. */
export function RouteError({ retry }: { retry: () => void }) {
  return <ErrorState message="We couldn't load your data. Try again in a moment." onRetry={retry} />;
}
