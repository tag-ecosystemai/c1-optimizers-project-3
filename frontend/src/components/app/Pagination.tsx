"use client";

import Link from "next/link";
import { useQueryHref } from "./useQueryHref";

const btn = "inline-flex h-8 items-center rounded-[10px] border border-white-800 bg-white px-2.5 text-xs text-black-400 hover:bg-white-300";
const off = "inline-flex h-8 items-center rounded-[10px] border border-line-faint px-2.5 text-xs text-disabled-foreground";

/**
 * Cursor pagination through the URL (`?cursor=`), keeping every other filter. Pass straight from a Page<T>.
 * @param nextCursor page.next_cursor
 * @param prevCursor page.prev_cursor (Previous goes back to the first page when absent)
 * @param count      Rows on this page (page.items.length).
 * @param total      page.total, if the API returns it.
 * @param param      URL param for the cursor (default "cursor").
 */
export function Pagination({ nextCursor, prevCursor, count, total, param = "cursor" }: { nextCursor: string | null; prevCursor?: string | null; count: number; total?: number; param?: string }) {
  const href = useQueryHref();
  const hasPrev = prevCursor !== undefined && prevCursor !== null;
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
      <span>{total !== undefined ? `${count} of ${total}` : `${count} shown`}</span>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link className={btn} href={href({ [param]: prevCursor })}>
            Previous
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Previous
          </span>
        )}
        {nextCursor ? (
          <Link className={btn} href={href({ [param]: nextCursor })}>
            Next
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
