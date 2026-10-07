"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { WarningCircle } from "@phosphor-icons/react";

/**
 * Error block with Retry (spec §9). Without `onRetry`, Retry re-renders the page (router.refresh()),
 * so Server Components can render it with no props. In an error.tsx boundary pass `onRetry={reset}`.
 * @param title   Headline (default "Something went wrong").
 * @param message Plain-language detail.
 * @param onRetry Custom retry handler (client components only).
 */
export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this. Try again in a moment.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50/50 px-6 py-10 text-center">
      <div aria-hidden="true" className="mb-1 grid size-10 place-items-center rounded-full bg-red-50 text-risk-high">
        <WarningCircle size={22} />
      </div>
      <p className="text-base text-fg">{title}</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => (onRetry ? onRetry() : startTransition(() => router.refresh()))}
        className="mt-2 h-9 cursor-pointer rounded-[10px] border border-white-800 bg-white px-3 text-sm text-black-400 transition-colors hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
