import type { ReactNode } from "react";

/** Link that opens in a new tab, and says so to screen readers. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
