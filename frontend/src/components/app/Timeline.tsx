import type { TimelineEvent } from "@/types/api";
import { date, relativeToAsOf } from "@/lib/format";

const dot = { done: "bg-fg", upcoming: "bg-white ring-2 ring-line-strong", warning: "bg-risk-high" };

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
          {i < events.length - 1 && <span aria-hidden="true" className="absolute top-3 left-[5px] h-full w-px bg-line" />}
          <span aria-hidden="true" className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ${dot[e.state]}`} />
          <div className="flex flex-col">
            <span className={`text-sm ${e.state === "warning" ? "text-risk-high" : "text-fg"}`}>{e.label}</span>
            <span className="text-xs text-muted">
              {date(e.date)}
              {asOfDate && ` · ${relativeToAsOf(e.date, asOfDate)}`}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
