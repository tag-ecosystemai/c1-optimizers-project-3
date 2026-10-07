import { Skeleton } from "@/components/app/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton lines={3} className="h-6 w-2/3" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton lines={4} />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}
