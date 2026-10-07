import type { ShapFactor } from "@/types/api";
import { days, percent } from "@/lib/format";

/**
 * Why the model thinks the order is late: horizontal bars per factor, positive (adds delay) red,
 * negative green, labelled in plain words. Card A swaps the inside for Recharts.
 * @param factors   SHAP contributions in days (uses `label` when present, else `feature`).
 * @param riskScore Optional delay_risk_score (0–1) shown above the bars.
 */
export function ShapChart({ factors, riskScore }: { factors: ShapFactor[]; riskScore?: number }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.1);
  const sorted = [...factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return (
    <figure className="flex flex-col gap-3">
      {riskScore !== undefined && (
        <p className="text-sm text-muted">
          Delay risk score <span className="text-fg tabular-nums">{percent(riskScore)}</span>
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {sorted.map((f) => (
          <li key={f.feature} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate text-fg-2">{f.label ?? f.feature}</span>
            <span className="h-2 rounded-full bg-line-faint">
              <span
                className={`block h-full rounded-full ${f.contribution >= 0 ? "bg-risk-high" : "bg-risk-low"}`}
                style={{ width: `${(Math.abs(f.contribution) / max) * 100}%` }}
              />
            </span>
            <span className="text-muted tabular-nums">{f.contribution >= 0 ? `adds ${days(f.contribution)}` : `saves ${days(-f.contribution)}`}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
