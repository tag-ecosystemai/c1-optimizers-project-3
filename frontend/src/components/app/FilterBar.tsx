"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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

const field =
  "h-9 rounded-[10px] border border-line bg-white px-2.5 text-sm text-fg transition-colors hover:border-line-strong " +
  "focus-visible:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/**
 * Filters and search that live in the URL (changing any of them resets `?cursor`).
 * Shows "Clear filters" when any is set, and "Updating…" while the page re-renders.
 * @param filters Select or date inputs.
 * @param search  Optional search box, e.g. { param: "q", placeholder: "Search orders" }; writes after a short pause.
 */
export function FilterBar({ filters, search }: { filters: FilterDef[]; search?: { param: string; placeholder: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const href = useQueryHref();
  const [pending, startTransition] = useTransition();
  const replace = (changes: Record<string, string | null>) => startTransition(() => router.replace(href({ ...changes, cursor: null }), { scroll: false }));
  const set = (param: string, value: string) => replace({ [param]: value || null });

  const urlQuery = search ? (params.get(search.param) ?? "") : "";
  const [q, setQ] = useState(urlQuery);
  useEffect(() => {
    if (!search || q === urlQuery) return;
    const t = setTimeout(() => set(search.param, q), 300);
    return () => clearTimeout(t);
  });

  const allParams = [...filters.map((f) => f.param), ...(search ? [search.param] : [])];
  const active = allParams.some((p) => params.get(p));
  const clear = () => {
    setQ("");
    replace(Object.fromEntries(allParams.map((p) => [p, null])));
  };

  return (
    <div role="search" aria-busy={pending} className="mb-4 flex flex-wrap items-end gap-2">
      {search && (
        <label className="relative flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted sm:max-w-80">
          <span>Search</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute bottom-2.5 left-2.5 size-4 text-muted">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={search.placeholder} className={`${field} pl-8`} />
        </label>
      )}
      {filters.map((f) => {
        const value = params.get(f.param) ?? "";
        return (
          <label key={f.param} className="flex min-w-32 flex-col gap-1 text-xs text-muted max-sm:flex-1">
            {f.label}
            {f.kind === "date" ? (
              <input type="date" value={value} onChange={(e) => set(f.param, e.target.value)} className={field} />
            ) : (
              <select value={value} onChange={(e) => set(f.param, e.target.value)} className={`${field} ${value ? "border-line-strong text-fg" : ""}`}>
                <option value="">{f.allLabel ?? "All"}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={clear}
          className="h-9 cursor-pointer rounded-[10px] px-2.5 text-sm text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          Clear filters
        </button>
      )}
      <span aria-live="polite" className="h-9 self-end text-xs leading-9 text-muted">
        {pending ? "Updating…" : ""}
      </span>
    </div>
  );
}
