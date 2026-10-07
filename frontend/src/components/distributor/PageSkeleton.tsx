import { Skeleton } from "@/components/app/Skeleton";

/** Shared body for the /my/* loading.tsx files: title, optional KPI row, list. */
export function PageSkeleton({ kpis }: { kpis?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton lines={2} className="h-6 w-56 max-w-full" />
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}
      <Skeleton rows={6} />
    </div>
  );
}
