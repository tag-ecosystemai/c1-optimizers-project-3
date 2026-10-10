import type { RiskBand } from "./risk";

// Colours from docs/FRONTEND_SPEC.md §4.1. The text label carries the meaning too, never colour alone.
const styles: Record<RiskBand, string> = {
  HIGH: "bg-risk-high text-white ring-risk-high",
  MEDIUM: "bg-[#f5c04a] text-[#3b2a00] ring-[#f5c04a]",
  LOW: "bg-[#dbe5ed] text-[#2c4860] ring-[#dbe5ed]",
  NONE: "bg-[#d9f0e3] text-[#1d6a45] ring-[#d9f0e3]",
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
