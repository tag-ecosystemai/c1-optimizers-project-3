"use client";

import { useRouter } from "next/navigation";

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
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50/50 px-6 py-10 text-center">
      <p className="text-base text-fg">{title}</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={() => (onRetry ? onRetry() : router.refresh())}
        className="mt-2 h-9 cursor-pointer rounded-[10px] border border-white-800 bg-white px-3 text-sm text-black-400 hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        Retry
      </button>
    </div>
  );
}
