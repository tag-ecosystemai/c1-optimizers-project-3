import type { DecisionAction, DecisionListParams } from "@/types/api";
import { first, isoDate, pick, type ParamValue } from "@/lib/params";

export const ACTIONS: DecisionAction[] = ["approved", "dismissed", "escalated", "acknowledged"];

/** History filters from the URL (page searchParams or the export route's query), invalid values dropped. */
export function historyParams(get: (key: string) => ParamValue): DecisionListParams {
  return {
    action: pick(get("action"), ACTIONS),
    from: isoDate(get("from")),
    to: isoDate(get("to")),
    cursor: first(get("cursor")),
  };
}
