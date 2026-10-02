import type { RiskBand } from "./risk";

const styles: Record<RiskBand, string> = {
  HIGH: "bg-red-50 text-risk-high ring-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  LOW: "bg-green-50 text-risk-low ring-green-200",
  COVERED: "bg-surface text-muted ring-line-faint",
};

export function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium ring-1 ring-inset ${styles[band]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {band === "COVERED" ? "Covered" : band[0] + band.slice(1).toLowerCase()}
    </span>
  );
}
