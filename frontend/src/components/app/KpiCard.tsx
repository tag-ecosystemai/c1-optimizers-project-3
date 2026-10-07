import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";

export interface KpiDelta {
  /** Preformatted change, e.g. "+2" or "+$340". */
  text: string;
  direction: "up" | "down" | "flat";
  /** good = green, bad = red, neutral = grey (default). */
  tone?: "good" | "bad" | "neutral";
  /** Defaults to "vs. yesterday". */
  label?: string;
}

const tones = { good: "text-green-700", bad: "text-risk-high", neutral: "text-muted" };
const arrows = { up: "↑", down: "↓", flat: "→" };

/**
 * One KPI: label, big number, optional delta and hint.
 * @param label   e.g. "Open incidents".
 * @param value   Preformatted value (use lib/format).
 * @param delta   Change vs. yesterday.
 * @param hint    Small grey line under the value.
 * @param loading Show a skeleton instead of the value.
 */
export function KpiCard({ label, value, delta, hint, loading }: { label: string; value: ReactNode; delta?: KpiDelta; hint?: ReactNode; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line-subtle bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      {loading ? <Skeleton className="h-8 w-24" /> : <p className="font-display text-2xl text-fg tabular-nums">{value}</p>}
      {!loading && delta && (
        <p className={`text-xs ${tones[delta.tone ?? "neutral"]}`}>
          <span aria-hidden="true">{arrows[delta.direction]}</span> {delta.text} <span className="text-muted">{delta.label ?? "vs. yesterday"}</span>
        </p>
      )}
      {!loading && hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
