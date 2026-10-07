"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryHref } from "./useQueryHref";

function useSort(sortKey: string, param: string, defaultSort?: string) {
  const current = useSearchParams().get(param) ?? defaultSort ?? "";
  const active = current.replace(/^-/, "") === sortKey;
  const desc = active && current.startsWith("-");
  return { active, desc, next: active && !desc ? `-${sortKey}` : sortKey };
}

/** Sortable column header used by DataTable: toggles `?sort=key` / `?sort=-key` and resets the cursor. */
export function SortHeader({ label, sortKey, param = "sort", defaultSort }: { label: string; sortKey: string; param?: string; defaultSort?: string }) {
  const href = useQueryHref();
  const { active, desc, next } = useSort(sortKey, param, defaultSort);
  return (
    <Link
      href={href({ [param]: next, cursor: null })}
      scroll={false}
      className={`-mx-1 inline-flex items-center gap-1 rounded-md px-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-blue-500 ${active ? "text-fg" : ""}`}
    >
      {label}
      <span aria-hidden="true" className={active ? "text-fg" : "text-line-strong"}>
        {active ? (desc ? "↓" : "↑") : "↕"}
      </span>
      <span className="sr-only">{active ? `, sorted ${desc ? "descending" : "ascending"}. Sort ${desc ? "ascending" : "descending"}` : ", sort"}</span>
    </Link>
  );
}

/** The `<th>` for a sortable column, so `aria-sort` reflects the URL. */
export function SortableTh({ label, sortKey, param = "sort", defaultSort, className }: { label: string; sortKey: string; param?: string; defaultSort?: string; className?: string }) {
  const { active, desc } = useSort(sortKey, param, defaultSort);
  return (
    <th scope="col" aria-sort={active ? (desc ? "descending" : "ascending") : "none"} className={className}>
      <SortHeader label={label} sortKey={sortKey} param={param} defaultSort={defaultSort} />
    </th>
  );
}
