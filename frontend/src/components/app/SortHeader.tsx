"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryHref } from "./useQueryHref";

/** Sortable column header used by DataTable: toggles `?sort=key` / `?sort=-key` and resets the cursor. */
export function SortHeader({ label, sortKey, param = "sort", defaultSort }: { label: string; sortKey: string; param?: string; defaultSort?: string }) {
  const href = useQueryHref();
  const current = useSearchParams().get(param) ?? defaultSort ?? "";
  const active = current.replace(/^-/, "") === sortKey;
  const desc = active && current.startsWith("-");
  const next = active && !desc ? `-${sortKey}` : sortKey;
  return (
    <Link href={href({ [param]: next, cursor: null })} className="inline-flex items-center gap-1 hover:text-fg" aria-label={`Sort by ${label}`}>
      {label}
      <span aria-hidden="true" className={active ? "text-fg" : "text-line-strong"}>
        {active ? (desc ? "↓" : "↑") : "↕"}
      </span>
    </Link>
  );
}
