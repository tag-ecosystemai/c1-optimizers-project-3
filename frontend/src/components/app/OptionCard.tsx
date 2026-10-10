"use client";

import type { RecommendedOption } from "@/types/api";
import { num, usd } from "@/lib/format";

/**
 * One recommended action as a selectable radio card (works inside a <form> via `name`).
 * Arrow keys move between cards with the same `name`, like any radio group.
 * @param option   The option (cost_usd / eta_days may be absent).
 * @param name     Radio group name (default "option"); the value is option_id.
 * @param selected Controlled checked state.
 * @param onSelect Called with option_id when picked.
 * @param disabled Lock after a decision.
 */
export function OptionCard({
  option,
  name = "option",
  selected,
  onSelect,
  disabled,
}: {
  option: RecommendedOption;
  name?: string;
  selected?: boolean;
  onSelect?: (optionId: string) => void;
  disabled?: boolean;
}) {
  const facts: [string, string][] = [];
  if (option.cost_usd !== undefined) facts.push(["Cost", option.cost_usd === 0 ? "No cost" : usd(option.cost_usd)]);
  if (option.eta_days !== undefined) facts.push(["Arrives in", option.eta_days === 1 ? "1 day" : `${option.eta_days} days`]);
  facts.push(["Covers", `${num(option.units_covered)} units`]);

  return (
    <label
      className={`group relative flex gap-3 rounded-xl border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-500 has-checked:border-fg has-checked:bg-surface has-checked:ring-1 has-checked:ring-fg ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-line-strong"
      } ${selected ? "border-fg" : "border-line-subtle bg-white"}`}
    >
      <input
        type="radio"
        name={name}
        value={option.option_id}
        checked={selected}
        onChange={() => onSelect?.(option.option_id)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-black-200 focus-visible:outline-none"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg">{option.title}</span>
          {option.recommended && (
            <span className="inline-flex h-5 items-center gap-1 rounded-md bg-blue-100 px-1.5 text-[12px] font-medium text-blue-600">
              <span aria-hidden="true">★</span>
              Recommended
            </span>
          )}
        </div>
        <p className="text-xs text-muted">{option.description}</p>
        {option.rationale && <p className="text-xs text-fg-2">{option.rationale}</p>}
        {option.cost_exceeds_money_at_risk && <p className="text-xs font-medium text-risk-high">⚠ Costs more than the money at risk</p>}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted">{k}</dt>
              <dd className="text-fg-2 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </label>
  );
}
