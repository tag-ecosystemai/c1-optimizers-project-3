const bar = "animate-pulse rounded-md bg-line-faint motion-reduce:animate-none";

/**
 * Loading placeholder.
 * @param lines     Stack of text lines (default 1); the last of several is shorter, like a paragraph.
 * @param rows      Table-like skeleton with this many rows (overrides lines).
 * @param className Size/shape of each bar, e.g. "h-24 w-full" (default "h-4 w-full").
 */
export function Skeleton({ lines = 1, rows, className = "h-4 w-full" }: { lines?: number; rows?: number; className?: string }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Loading…</span>
      {rows ? (
        <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line-subtle">
          <div className="flex gap-4 bg-surface px-3 py-3">
            <div className={`${bar} h-3 w-1/4 bg-line-subtle`} />
            <div className={`${bar} h-3 w-1/5 bg-line-subtle`} />
            <div className={`${bar} ml-auto h-3 w-1/6 bg-line-subtle`} />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-line-faint px-3 py-3">
              <div className={`${bar} h-4 w-1/4`} />
              <div className={`${bar} h-4 w-1/5`} />
              <div className={`${bar} ml-auto h-4 w-1/6`} />
            </div>
          ))}
        </div>
      ) : (
        Array.from({ length: lines }, (_, i) => (
          <div key={i} aria-hidden="true" className={`${bar} ${className} ${lines > 1 && i === lines - 1 ? "max-w-[66%]" : ""}`} />
        ))
      )}
    </div>
  );
}
