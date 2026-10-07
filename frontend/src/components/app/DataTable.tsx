import type { ReactNode } from "react";
import Link from "next/link";
import { SortableTh } from "./SortHeader";
import { EmptyState } from "./EmptyState";

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
const th = "sticky top-0 z-10 border-b border-line-subtle bg-surface px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted";

/**
 * Table for every list screen. Works in Server and Client Components (sorting goes through the URL).
 * The header sticks while the table body scrolls (the table scrolls inside a box up to 70% of the viewport tall).
 * With `rowHref`, the whole row is clickable and the first cell's link is the keyboard stop (Tab, then Enter).
 * @param columns     Column definitions (see Column).
 * @param rows        The current page of rows.
 * @param rowKey      Stable key per row.
 * @param rowHref     Makes each row a link (keyboard reachable via the first cell).
 * @param caption     Accessible caption (visually hidden).
 * @param sortParam   URL param for sorting (default "sort").
 * @param defaultSort Sort applied when the URL has none, so the header shows it (e.g. "-money_at_risk_usd").
 * @param empty       Rendered instead of the table when rows is empty (default: a plain "Nothing to show" EmptyState).
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
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing to show" description="No rows match. Try clearing a filter." />}</>;
  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-line-subtle bg-white">
      <table className="w-full border-separate border-spacing-0 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const cls = `${th} ${c.align === "right" ? "text-right" : ""} ${c.hideBelow ? hide[c.hideBelow] : ""}`;
              return c.sortKey ? (
                <SortableTh key={c.key} label={c.header} sortKey={c.sortKey} param={sortParam} defaultSort={defaultSort} className={cls} />
              ) : (
                <th key={c.key} scope="col" className={cls}>
                  {c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className={`group ${
                  href
                    ? "relative cursor-pointer hover:bg-surface has-[a:focus-visible]:bg-surface has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-blue-500"
                    : ""
                }`}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`border-t border-line-faint px-3 py-2.5 align-middle text-fg-2 group-first:border-t-0 ${c.align === "right" ? "text-right tabular-nums" : ""} ${
                      c.hideBelow ? hide[c.hideBelow] : ""
                    } ${c.className ?? ""}`}
                  >
                    {href && i === 0 ? (
                      <Link href={href} className="font-medium text-fg outline-none after:absolute after:inset-0 hover:underline">
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
