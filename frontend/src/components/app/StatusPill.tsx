import type { DecisionAction, IncidentStatus, OrderStatus } from "@/types/api";

export type PillStatus = IncidentStatus | DecisionAction | OrderStatus;

const styles: Record<PillStatus, string> = {
  open: "bg-blue-100 text-blue-600",
  approved: "bg-green-50 text-green-700",
  dismissed: "bg-surface text-muted",
  escalated: "bg-amber-50 text-amber-700",
  resolved: "bg-surface text-fg-2",
  acknowledged: "bg-surface text-fg-2",
  processing: "bg-surface text-muted",
  in_transit: "bg-blue-100 text-blue-600",
  delivered: "bg-green-50 text-green-700",
};

const labels: Partial<Record<PillStatus, string>> = { in_transit: "In transit" };

/**
 * Incident, decision or order status as a labelled pill.
 * @param status open / approved / dismissed / escalated / resolved / acknowledged, or an order status.
 */
export function StatusPill({ status }: { status: PillStatus }) {
  const label = labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium ${styles[status]}`}>{label}</span>;
}
