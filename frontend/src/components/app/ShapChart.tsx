"use client";

import { Bar, BarChart, LabelList, Rectangle, ReferenceLine, XAxis, YAxis } from "recharts";
import type { ShapFactor } from "@/types/api";
import { days, percent } from "@/lib/format";

// Hex, not CSS vars: SVG presentation attributes don't resolve var(). Same values as --color-risk-high / --color-risk-low.
const RED = "#dc2626";
const GREEN = "#16a34a";

const effect = (c: number) => (c >= 0 ? `adds ${days(c)}` : `saves ${days(-c)}`);

/**
 * Why the model thinks the order is late: horizontal bars per factor, positive (adds delay) red,
 * negative (reduces delay) green, each labelled in plain words ("adds 2.1 days"). Screen readers get a plain list.
 * @param factors   SHAP contributions in days (uses `label` when present, else `feature`).
 * @param riskScore Optional delay_risk_score (0–1) shown above the bars.
 */
export function ShapChart({ factors, riskScore }: { factors: ShapFactor[]; riskScore?: number }) {
  const data = [...factors]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map((f) => ({ name: f.label ?? f.feature, contribution: f.contribution }));
  const max = Math.max(...data.map((d) => Math.abs(d.contribution)), 0.1);
  const maxNeg = Math.max(...data.map((d) => -d.contribution), 0);
  const hasNegative = maxNeg > 0;
  const tick = { fontSize: 12, fill: "#2d3238" };

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        {riskScore !== undefined ? (
          <span>
            Delay risk score <span className="font-display text-base text-fg tabular-nums">{percent(riskScore)}</span>
          </span>
        ) : (
          <span>What drives the predicted delay</span>
        )}
        <span aria-hidden="true" className="flex gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: RED }} /> Adds delay
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: GREEN }} /> Reduces delay
          </span>
        </span>
      </figcaption>

      {data.length === 0 ? (
        <p className="text-sm text-muted">No factor breakdown for this prediction.</p>
      ) : (
        <>
          <div aria-hidden="true" className="w-full">
            <BarChart
              layout="vertical"
              data={data}
              responsive
              style={{ width: "100%", height: data.length * 34 + 8 }}
              margin={{ top: 4, right: 84, bottom: 4, left: 0 }}
              accessibilityLayer={false}
            >
              {/* Right margin holds the "adds 2.1 days" label of the longest bar; the negative side is only as wide as the biggest saving. */}
              <XAxis type="number" hide domain={[-maxNeg * 1.1, max]} />
              <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={tick} interval={0} />
              {hasNegative && <ReferenceLine x={0} stroke="#c9d0d9" />}
              <Bar
                dataKey="contribution"
                barSize={14}
                radius={4}
                isAnimationActive={false}
                shape={(props) => <Rectangle {...props} fill={(props.payload as { contribution: number }).contribution >= 0 ? RED : GREEN} />}
              >
                <LabelList
                  dataKey="contribution"
                  content={(p) => {
                    const [x, y, w, h, v] = [Number(p.x), Number(p.y), Number(p.width), Number(p.height), Number(p.value)];
                    const end = Math.max(x, x + w) + 6; // right of the bar, or right of the zero line for negatives
                    return (
                      <text x={end} y={y + h / 2} dy="0.35em" textAnchor="start" fontSize={12} fill="#6d7988">
                        {effect(v)}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </div>
          <ul className="sr-only">
            {data.map((d) => (
              <li key={d.name}>
                {d.name}: {d.contribution >= 0 ? "adds" : "takes"} {days(Math.abs(d.contribution))} {d.contribution >= 0 ? "to" : "off"} the delay
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
