"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { num } from "@/lib/format";
import { useQueryHref } from "./useQueryHref";

const base = "inline-flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-xs";
const btn = `${base} border-white-800 bg-white text-black-400 transition-colors hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`;
const off = `${base} cursor-not-allowed border-line-faint text-disabled-foreground`;

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
  const onLaterPage = useSearchParams().has(param);
  // No prev_cursor from the API but we're past page one: Previous goes back to the first page.
  const hasPrev = Boolean(prevCursor) || onLaterPage;
  const prevHref = href({ [param]: prevCursor || null });
  if (!hasPrev && !nextCursor && total === undefined && count === 0) return null;
  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <p aria-live="polite" className="tabular-nums">
        {total !== undefined ? (
          <>
            Showing <span className="text-fg-2">{num(count)}</span> of <span className="text-fg-2">{num(total)}</span>
          </>
        ) : (
          <>
            <span className="text-fg-2">{num(count)}</span> shown
          </>
        )}
      </p>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link className={btn} href={prevHref} rel="prev" scroll={false}>
            <span aria-hidden="true">←</span> Previous
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            <span aria-hidden="true">←</span> Previous
          </span>
        )}
        {nextCursor ? (
          <Link className={btn} href={href({ [param]: nextCursor })} rel="next" scroll={false}>
            Next <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Next <span aria-hidden="true">→</span>
          </span>
        )}
      </div>
    </nav>
  );
}
