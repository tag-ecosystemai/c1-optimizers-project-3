"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

const axis = { fontSize: 12, fill: "#6d7988" };

/** One metric per training run, oldest first. */
export function MetricTrendChart({ points, metric }: { points: { label: string; value: number }[]; metric: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <LineChart responsive data={points} style={{ width: "100%", height: 160 }} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#eceff3" vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip formatter={(v) => [v, metric]} />
        <Line type="linear" dataKey="value" name={metric} stroke="#266df0" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
      <figcaption className="text-xs text-muted">{metric} by version, lower is better. Failed runs are left out.</figcaption>
    </figure>
  );
}

/** Horizontal bars: tool name → call count. */
export function ToolCallChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <BarChart responsive layout="vertical" data={data} style={{ width: "100%", height: 40 * data.length + 24 }} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
      <CartesianGrid stroke="#eceff3" horizontal={false} />
      <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
      <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={130} />
      <Tooltip cursor={{ fill: "#f6f7f9" }} />
      <Bar dataKey="count" name="Calls" fill="#266df0" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
    </BarChart>
  );
}
