import type { RiskBand } from "./risk";

// Colours from docs/FRONTEND_SPEC.md §4.1. The text label carries the meaning too, never colour alone.
const styles: Record<RiskBand, string> = {
  HIGH: "bg-red-50 text-risk-high ring-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  LOW: "bg-slate-50 text-slate-600 ring-slate-200",
  NONE: "bg-green-50 text-risk-low ring-green-200",
};

const labels: Record<RiskBand, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low", NONE: "Covered" };

export function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium ring-1 ring-inset ${styles[band]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {labels[band]}
    </span>
  );
}
