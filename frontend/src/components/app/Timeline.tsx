import type { TimelineEvent } from "@/types/api";
import { date, relativeToAsOf } from "@/lib/format";

// Shape and a spoken word carry the state as well as colour: filled = done, hollow = expected, "!" = problem.
const dot = {
  done: "bg-fg ring-4 ring-white",
  upcoming: "bg-white ring-2 ring-line-strong",
  warning: "bg-risk-high ring-4 ring-red-50 text-white",
};
const spoken = { done: "Done", upcoming: "Expected", warning: "Problem" };

/**
 * Order lifecycle: ordered → shipped → original ETA → predicted ETA → stockout (spec §4.3).
 * @param events   In display order (the API returns them sorted by date).
 * @param asOfDate Optional; adds "in 5 days" / "2 days ago" next to each date.
 */
export function Timeline({ events, asOfDate }: { events: TimelineEvent[]; asOfDate?: string }) {
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => (
        <li key={e.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < events.length - 1 && (
            <span aria-hidden="true" className={`absolute top-4 bottom-0 left-[7px] ${e.state === "done" ? "w-px bg-fg/40" : "w-0 border-l border-dashed border-line-strong"}`} />
          )}
          <span aria-hidden="true" className={`relative mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full text-[10px] leading-none font-semibold ${dot[e.state]}`}>
            {e.state === "warning" ? "!" : ""}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className={`text-sm ${e.state === "warning" ? "text-risk-high" : e.state === "upcoming" ? "text-fg-2" : "text-fg"}`}>
              <span className="sr-only">{spoken[e.state]}: </span>
              {e.label}
            </span>
            <span className="text-xs text-muted tabular-nums">
              <time dateTime={e.date}>{date(e.date)}</time>
              {asOfDate && ` · ${relativeToAsOf(e.date, asOfDate)}`}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
