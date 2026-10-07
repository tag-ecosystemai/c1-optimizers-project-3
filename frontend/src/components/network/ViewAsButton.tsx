import { viewAs } from "@/lib/auth/actions";

/** Submits the View as server action for a warehouse or distributor. */
export function ViewAsButton({ kind, id, name }: { kind: "warehouse" | "distributor"; id: number; name: string }) {
  return (
    <form action={viewAs}>
      <input type="hidden" name="target" value={`${kind}:${id}`} />
      <button
        type="submit"
        aria-label={`View as ${name}`}
        className="inline-flex h-8 cursor-pointer items-center rounded-[10px] border border-white-800 bg-white px-2.5 text-xs whitespace-nowrap text-black-400 hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        View as
      </button>
    </form>
  );
}
