import type { ReactNode } from "react";

export interface KpiDelta {
  /** Preformatted change, e.g. "+2" or "+$340". */
  text: string;
  direction: "up" | "down" | "flat";
  /** good = green, bad = red, neutral = grey (default). */
  tone?: "good" | "bad" | "neutral";
  /** Defaults to "vs. yesterday". */
  label?: string;
}

const tones = { good: "bg-green-50 text-green-700", bad: "bg-red-50 text-risk-high", neutral: "bg-surface text-muted" };
const arrows = { up: "↑", down: "↓", flat: "→" };
const spoken = { up: "Up", down: "Down", flat: "No change" };
const pulse = "animate-pulse rounded-md bg-line-faint motion-reduce:animate-none";

/**
 * One KPI: label, big number, optional delta and hint.
 * @param label   e.g. "Open incidents".
 * @param value   Preformatted value (use lib/format).
 * @param delta   Change vs. yesterday.
 * @param hint    Small grey line under the value.
 * @param loading Show a skeleton instead of the value.
 */

const edge = { high: "border-l-risk-high", medium: "border-l-risk-med", low: "border-l-risk-low", ok: "border-l-risk-ok" } as const;

export function KpiCard({
  label,
  value,
  delta,
  hint,
  loading,
  accent,
}: {
  label: string;
  value: ReactNode;
  delta?: KpiDelta;
  hint?: ReactNode;
  loading?: boolean;
  /** Colours a 4px edge so urgent numbers stand out. */
  accent?: keyof typeof edge;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-xl border border-line-subtle bg-white p-4 ${accent ? `border-l-4 ${edge[accent]}` : ""}`}>
      <p className="truncate text-sm font-medium text-muted">{label}</p>
      {loading ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Loading {label}</span>
          <div aria-hidden="true" className={`${pulse} h-8 w-24`} />
          <div aria-hidden="true" className={`${pulse} h-5 w-32`} />
        </div>
      ) : (
        <>
          <p className="font-display text-3xl leading-9 font-semibold tracking-tight text-fg tabular-nums">{value}</p>
          {delta && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 tabular-nums ${tones[delta.tone ?? "neutral"]}`}>
                <span aria-hidden="true">{arrows[delta.direction]}</span>
                <span className="sr-only">{spoken[delta.direction]} </span>
                {delta.text}
              </span>
              <span className="text-muted">{delta.label ?? "vs. yesterday"}</span>
            </p>
          )}
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}