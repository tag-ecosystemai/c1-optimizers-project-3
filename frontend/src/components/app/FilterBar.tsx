"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryHref } from "./useQueryHref";

export interface FilterDef {
  /** URL param this filter writes, e.g. "severity". */
  param: string;
  label: string;
  /** select (default) needs options; date writes `YYYY-MM-DD`. */
  kind?: "select" | "date";
  options?: { value: string; label: string }[];
  /** Label of the empty choice (default "All"). */
  allLabel?: string;
}

const field = "h-9 rounded-[10px] border border-line bg-white px-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-blue-500";

/**
 * Filters and search that live in the URL (changing any of them resets `?cursor`).
 * @param filters Select or date inputs.
 * @param search  Optional search box, e.g. { param: "q", placeholder: "Search orders" }; writes after a short pause.
 */
export function FilterBar({ filters, search }: { filters: FilterDef[]; search?: { param: string; placeholder: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const href = useQueryHref();
  const set = (param: string, value: string) => router.replace(href({ [param]: value || null, cursor: null }), { scroll: false });

  const urlQuery = search ? (params.get(search.param) ?? "") : "";
  const [q, setQ] = useState(urlQuery);
  useEffect(() => {
    if (!search || q === urlQuery) return;
    const t = setTimeout(() => set(search.param, q), 300);
    return () => clearTimeout(t);
  });

  return (
    <div role="search" className="mb-4 flex flex-wrap items-end gap-2">
      {search && (
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
          <span className="sr-only">{search.placeholder}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={search.placeholder} className={field} />
        </label>
      )}
      {filters.map((f) => (
        <label key={f.param} className="flex flex-col gap-1 text-xs text-muted">
          {f.label}
          {f.kind === "date" ? (
            <input type="date" value={params.get(f.param) ?? ""} onChange={(e) => set(f.param, e.target.value)} className={field} />
          ) : (
            <select value={params.get(f.param) ?? ""} onChange={(e) => set(f.param, e.target.value)} className={field}>
              <option value="">{f.allLabel ?? "All"}</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
    </div>
  );
}
