"use client";

import { RouteError } from "@/components/app/RouteError";

export default function Error({ retry }: { retry: () => void }) {
  return <RouteError retry={retry} />;
}
