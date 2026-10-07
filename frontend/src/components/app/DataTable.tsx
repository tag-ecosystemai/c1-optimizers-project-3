import type { ReactNode } from "react";
import Link from "next/link";
import { SortHeader } from "./SortHeader";

export interface Column<T> {
  /** Unique column id. */
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the header a sort link writing `?sort=<sortKey>` / `-<sortKey>`. */
  sortKey?: string;
  align?: "left" | "right";
  /** Hide on small screens, e.g. "md" hides below 768px. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
}

const hide = { sm: "max-sm:hidden", md: "max-md:hidden", lg: "max-lg:hidden" };

/**
 * Table for every list screen. Works in Server and Client Components (sorting goes through the URL).
 * @param columns     Column definitions (see Column).
 * @param rows        The current page of rows.
 * @param rowKey      Stable key per row.
 * @param rowHref     Makes each row a link (keyboard reachable via the first cell).
 * @param caption     Accessible caption (visually hidden).
 * @param sortParam   URL param for sorting (default "sort").
 * @param defaultSort Sort applied when the URL has none, so the header shows it (e.g. "-money_at_risk_usd").
 * @param empty       Rendered instead of the table when rows is empty.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  caption,
  sortParam = "sort",
  defaultSort,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string;
  caption?: string;
  sortParam?: string;
  defaultSort?: string;
  empty?: ReactNode;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line-subtle">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2.5 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : ""} ${c.hideBelow ? hide[c.hideBelow] : ""}`}>
                {c.sortKey ? <SortHeader label={c.header} sortKey={c.sortKey} param={sortParam} defaultSort={defaultSort} /> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)} className={`border-t border-line-faint ${href ? "relative hover:bg-surface focus-within:bg-surface" : ""}`}>
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-3 py-2.5 text-fg-2 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.hideBelow ? hide[c.hideBelow] : ""} ${c.className ?? ""}`}>
                    {href && i === 0 ? (
                      <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-blue-500">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
