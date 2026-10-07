"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OpsSummary } from "@/types/api";
import { usd } from "@/lib/format";

/** $ at risk per market (open incidents), horizontal bars, biggest first. */
export function MarketChart({ data }: { data: OpsSummary["by_market"] }) {
  const rows = [...data].sort((a, b) => b.money_at_risk_usd - a.money_at_risk_usd);
  return (
    <figure aria-label="Dollars at risk by market">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="market" width={90} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-muted)" }} />
            <Tooltip
              cursor={{ fill: "var(--color-surface)" }}
              formatter={(v) => [usd(Number(v)), "At risk"]}
              contentStyle={{ fontSize: 12, borderRadius: 10, borderColor: "var(--color-line-subtle)" }}
            />
            <Bar dataKey="money_at_risk_usd" fill="var(--color-risk-high)" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Same numbers as text: readable without the chart and by screen readers. */}
      <figcaption>
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {rows.map((r) => (
            <li key={r.market} className="flex justify-between gap-2 text-muted">
              <span>
                {r.market} · {r.open_incidents} open
              </span>
              <span className="text-fg-2 tabular-nums">{usd(r.money_at_risk_usd)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
