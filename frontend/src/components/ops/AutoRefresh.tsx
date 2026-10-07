"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page's Server Components every `seconds` (Watchtower: 60 s; investigating incident: 10 s). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
