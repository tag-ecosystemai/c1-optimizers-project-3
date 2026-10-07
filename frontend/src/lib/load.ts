import { unstable_rethrow } from "next/navigation";

/** Runs a data function; returns null on failure so the block can show ErrorState. Next's redirects still go through. */
export async function load<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    console.error(err);
    return null;
  }
}
