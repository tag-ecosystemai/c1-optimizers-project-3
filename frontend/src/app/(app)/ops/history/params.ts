import type { DecisionAction, DecisionListParams } from "@/types/api";

export const ACTIONS: DecisionAction[] = ["approved", "dismissed", "escalated", "acknowledged"];
const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** History filters from the URL (page searchParams or the export route's query), invalid values dropped. */
export function historyParams(get: (key: string) => string | string[] | null | undefined): DecisionListParams {
  const one = (k: string) => {
    const v = get(k);
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const action = one("action");
  return {
    action: ACTIONS.includes(action as DecisionAction) ? (action as DecisionAction) : undefined,
    from: isDate(one("from")),
    to: isDate(one("to")),
    cursor: one("cursor"),
  };
}
