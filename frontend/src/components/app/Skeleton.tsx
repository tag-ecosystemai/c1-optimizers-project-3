/**
 * Loading placeholder.
 * @param lines     Stack of text lines (default 1).
 * @param rows      Table-like skeleton with this many rows (overrides lines).
 * @param className Size/shape of each bar, e.g. "h-24 w-full" (default "h-4 w-full").
 */
export function Skeleton({ lines = 1, rows, className = "h-4 w-full" }: { lines?: number; rows?: number; className?: string }) {
  const count = rows ?? lines;
  return (
    <div role="status" aria-label="Loading" className={`flex flex-col ${rows ? "gap-3" : "gap-2"}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`animate-pulse rounded-md bg-line-faint motion-reduce:animate-none ${rows ? "h-10 w-full" : className}`} />
      ))}
    </div>
  );
}
