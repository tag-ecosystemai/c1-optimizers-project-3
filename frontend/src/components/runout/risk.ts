// Severity bands, same as cascade/impact.py RISK_BANDS and docs/FRONTEND_SPEC.md §4.1:
// NONE = no stockout projected, LOW < $100, MEDIUM $100–$500, HIGH ≥ $500.
export type RiskBand = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export function riskBand(moneyAtRisk: number): RiskBand {
  if (moneyAtRisk <= 0) return "NONE";
  if (moneyAtRisk < 100) return "LOW";
  if (moneyAtRisk < 500) return "MEDIUM";
  return "HIGH";
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
