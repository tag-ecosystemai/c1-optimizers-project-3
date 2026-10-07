import { ErrorState } from "./ErrorState";

/** Error block for a section whose data failed to load (pair with `load()` from `@/lib/load`). */
export function LoadError({ what }: { what: string }) {
  return <ErrorState message={`We couldn't load ${what}. Try again in a moment.`} />;
}
