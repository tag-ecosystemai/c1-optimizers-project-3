"use client";

import type { RecommendedOption } from "@/types/api";
import { num, usd } from "@/lib/format";

/**
 * One recommended action as a selectable radio card (works inside a <form> via `name`).
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
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 has-focus-visible:outline-2 has-focus-visible:outline-blue-500 ${
        selected ? "border-fg bg-surface" : "border-line-subtle bg-white hover:border-line"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name={name}
        value={option.option_id}
        checked={selected}
        onChange={() => onSelect?.(option.option_id)}
        disabled={disabled}
        className="mt-1 accent-black-200"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg">{option.title}</span>
          {option.recommended && <span className="rounded-md bg-blue-100 px-1.5 text-[12px] font-medium text-blue-600">Recommended</span>}
        </div>
        <p className="text-xs text-muted">{option.description}</p>
        <p className="text-xs text-fg-2 tabular-nums">
          {option.cost_usd !== undefined && <>{option.cost_usd === 0 ? "No cost" : usd(option.cost_usd)} · </>}
          {option.eta_days !== undefined && <>arrives in {option.eta_days} days · </>}
          covers {num(option.units_covered)} units
        </p>
      </div>
    </label>
  );
}
