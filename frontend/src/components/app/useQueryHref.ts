"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** Builds hrefs for the current page with some search params changed (null removes one). */
export function useQueryHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}
