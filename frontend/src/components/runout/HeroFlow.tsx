const STAGES = [
  { title: "Orders arrive", note: "Scored for delay risk as they land", state: "done" },
  { title: "Cascade finds the gap", note: "Stock runs out in 4 days; next delivery lands in 9", state: "done", tag: "HIGH" },
  {
    title: "Agent investigates",
    note: "Calls its tools and records what it finds",
    state: "working",
    calls: ["get_weather: heavy rain near the hub", "search_news: port disruption reported", "get_delay_stats: Standard Class running 62% late"],
  },
  { title: "Options built from policy", note: "Transfer 120 units from another warehouse (recommended)", state: "waiting" },
  { title: "Operations decides", note: "Approve, dismiss or escalate", state: "waiting" },
] as const;

const dot = { done: "bg-green-500", working: "bg-amber-400", waiting: "bg-slate-300" } as const;
const label = { done: "Done", working: "Working", waiting: "Waiting" } as const;

/** An illustrative walk through one incident. Not live data. */
export function HeroFlow({ compact }: { compact?: boolean }) {
  const stages = compact ? STAGES.filter((s) => s.state !== "waiting" || s.title.startsWith("Operations")) : STAGES;
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-white-100 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-primary-foreground lg:text-base">One incident, start to finish</p>
        <span className="rounded-full border border-subtle-stroke px-2 py-0.5 text-[11px] text-tertiary-foreground">Illustrative example</span>
      </div>
      <ol className="flex flex-col gap-2">
        {stages.map((s) => (
          <li key={s.title} className="rounded-xl border border-subtle-stroke bg-white p-3 lg:p-4">
            <div className="flex items-center gap-3">
              <span className={`size-2.5 shrink-0 rounded-full ${dot[s.state]}`} />
              <span className="text-sm font-medium text-primary-foreground lg:text-base">{s.title}</span>
              {"tag" in s && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">{s.tag}</span>}
              <span className="ml-auto text-xs text-tertiary-foreground">{label[s.state]}</span>
            </div>
            <p className="mt-1 pl-5 text-xs text-secondary-foreground lg:text-sm">{s.note}</p>
            {"calls" in s && !compact && (
              <ul className="mt-2 flex flex-col gap-1 pl-5 font-mono text-[11px] text-secondary-foreground lg:text-xs">
                {s.calls.map((c) => (
                  <li key={c}>✓ {c}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}