"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Spec §9: re-renders Server Components when the window regains focus, at most once every 30 s. */
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);
  return null;
}
