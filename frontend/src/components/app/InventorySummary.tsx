import { KpiCard } from "@/components/app/KpiCard";

type Row = { severity?: string | null; days_of_cover?: number | null };

const BANDS = [
  { key: "HIGH", label: "High", bar: "bg-risk-high" },
  { key: "MEDIUM", label: "Medium", bar: "bg-risk-med" },
  { key: "LOW", label: "Low", bar: "bg-risk-low" },
  { key: "COVERED", label: "Covered", bar: "bg-risk-ok" },
] as const;

const bandOf = (s?: string | null) => {
  const v = String(s ?? "").toUpperCase();
  return v === "HIGH" || v === "MEDIUM" || v === "LOW" ? v : "COVERED";
};

/** KPI cards plus a "products by severity" bar chart, computed from the rows. */
export function InventorySummary({ items }: { items: Row[] }) {
  const counts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, COVERED: 0 };
  items.forEach((r) => (counts[bandOf(r.severity)] += 1));
  const covers = items.map((r) => r.days_of_cover).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const avg = covers.length ? covers.reduce((a, b) => a + b, 0) / covers.length : 0;
  const lowest = covers.length ? Math.min(...covers) : 0;
  const total = items.length || 1;

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Products tracked" value={String(items.length)} />
        <KpiCard accent="high" label="At risk (High + Medium)" value={String(counts.HIGH + counts.MEDIUM)} />
        <KpiCard accent="medium" label="Lowest days of cover" value={`${lowest.toFixed(1)} days`} />
        <KpiCard accent="ok" label="Average days of cover" value={`${avg.toFixed(1)} days`} />
      </div>
      <div className="rounded-2xl border border-line-subtle bg-white p-5 shadow-soft">
        <h3 className="font-display font-semibold text-fg">Products by severity</h3>
        <ul className="mt-4 flex flex-col gap-3">
          {BANDS.map((b) => (
            <li key={b.key} className="flex items-center gap-3 text-sm">
              <span className="w-16 text-fg-2">{b.label}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface">
                <span className={`block h-full rounded-full ${b.bar}`} style={{ width: `${(counts[b.key] / total) * 100}%` }} />
              </span>
              <span className="w-8 text-right font-medium tabular-nums text-fg">{counts[b.key]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}