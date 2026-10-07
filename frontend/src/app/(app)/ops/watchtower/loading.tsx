import { PageHeader } from "@/components/app/PageHeader";
import { Skeleton } from "@/components/app/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Watchtower" description="What needs your attention right now, ranked by dollars at risk." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton rows={8} />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </>
  );
}
