// Mirrors cascade/impact.py RISK_BANDS: < $10k LOW, < $50k MEDIUM, else HIGH.
export type RiskBand = "HIGH" | "MEDIUM" | "LOW" | "COVERED";

export function riskBand(moneyAtRisk: number): RiskBand {
  if (moneyAtRisk <= 0) return "COVERED";
  if (moneyAtRisk < 10_000) return "LOW";
  if (moneyAtRisk < 50_000) return "MEDIUM";
  return "HIGH";
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
