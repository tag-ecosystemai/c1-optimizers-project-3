import type { Evidence } from "@/types/api";
import { dateTime } from "@/lib/format";

const icons: Record<Evidence["type"], string> = { news: "📰", weather: "🌧", data: "📊" };
const labels: Record<Evidence["type"], string> = { news: "News", weather: "Weather", data: "Data" };

/**
 * What the agent found while investigating (spec §6.2 evidence).
 * @param items Evidence items; renders nothing when empty (show an EmptyState around it if needed).
 */
export function EvidenceList({ items }: { items: Evidence[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line-faint rounded-xl border border-line-subtle">
      {items.map((e, i) => (
        <li key={i} className="flex gap-3 p-3">
          <span aria-hidden="true" className="text-base">
            {icons[e.type]}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm text-fg">{e.summary}</p>
            <p className="text-xs text-muted">
              {labels[e.type]} · {e.source} · {dateTime(e.timestamp)}
              {e.url && (
                <>
                  {" · "}
                  <a href={e.url} target="_blank" rel="noreferrer" className="underline hover:text-fg">
                    Source
                  </a>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
