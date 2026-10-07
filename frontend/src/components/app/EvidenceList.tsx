import type { Evidence } from "@/types/api";
import { ArrowUpRight, ChartBar, CloudRain, Newspaper } from "@phosphor-icons/react/ssr";
import { dateTime } from "@/lib/format";

const kinds = {
  news: { label: "News", Icon: Newspaper, tone: "bg-blue-100 text-blue-600" },
  weather: { label: "Weather", Icon: CloudRain, tone: "bg-amber-50 text-amber-700" },
  data: { label: "Data", Icon: ChartBar, tone: "bg-surface text-fg-2" },
} satisfies Record<Evidence["type"], unknown>;

/**
 * What the agent found while investigating (spec §6.2 evidence): source icon and type, summary, link, timestamp.
 * @param items Evidence items; renders nothing when empty (show an EmptyState around it if needed).
 */
export function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col divide-y divide-line-faint rounded-xl border border-line-subtle bg-white">
      {items.map((e, i) => {
        const { label, Icon, tone } = kinds[e.type];
        return (
          <li key={i} className="flex gap-3 p-3">
            <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}>
              <Icon size={16} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm text-fg">{e.summary}</p>
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                <span className="text-fg-2">{label}</span>
                <span aria-hidden="true">·</span>
                <span>{e.source}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={e.timestamp}>{dateTime(e.timestamp)}</time>
                {e.url && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 rounded text-blue-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"
                    >
                      Open source
                      <ArrowUpRight aria-hidden="true" size={12} />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
