import type { DecisionAction, IncidentStatus, OrderStatus } from "@/types/api";

export type PillStatus = IncidentStatus | DecisionAction | OrderStatus;

export const INCIDENT_STATUSES: IncidentStatus[] = ["open", "escalated", "approved", "dismissed", "resolved", "withdrawn"];
/** Filter options for incident status, labelled like the pill. */
export const INCIDENT_STATUS_OPTIONS = INCIDENT_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

// The text carries the meaning; colour and the glyph only reinforce it.
const styles: Record<PillStatus, string> = {
  open: "bg-blue-100 text-blue-600 ring-blue-200",
  approved: "bg-green-50 text-green-700 ring-green-200",
  dismissed: "bg-surface text-muted ring-line-subtle",
  escalated: "bg-amber-50 text-amber-700 ring-amber-200",
  resolved: "bg-surface text-fg-2 ring-line-subtle",
  acknowledged: "bg-surface text-fg-2 ring-line-subtle",
  processing: "bg-surface text-muted ring-line-subtle",
  in_transit: "bg-blue-100 text-blue-600 ring-blue-200",
  delivered: "bg-green-50 text-green-700 ring-green-200",
  withdrawn: "bg-surface text-muted ring-line-subtle",
};

const glyphs: Record<PillStatus, string> = {
  open: "●",
  approved: "✓",
  dismissed: "–",
  escalated: "↑",
  resolved: "✓",
  acknowledged: "✓",
  processing: "○",
  in_transit: "→",
  delivered: "✓",
  withdrawn: "×",
};

const labels: Partial<Record<PillStatus, string>> = { in_transit: "In transit", withdrawn: "No longer at risk" };

/**
 * Incident, decision or order status as a labelled pill.
 * @param status open / approved / dismissed / escalated / resolved / acknowledged, or an order status.
 */
export function StatusPill({ status }: { status: PillStatus }) {
  const label = labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset ${styles[status]}`}>
      <span aria-hidden="true" className="text-[10px] leading-none">
        {glyphs[status]}
      </span>
      {label}
    </span>
  );
}
