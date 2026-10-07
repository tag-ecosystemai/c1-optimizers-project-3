import type {
  DecisionListParams,
  DecisionLogItem,
  IncidentDetail,
  IncidentListItem,
  IncidentListParams,
  Page,
  Role,
  Severity,
} from "@/types/api";
import { db } from "@/mocks/db";
import type { MockIncident } from "@/mocks/incidents";
import { distributorById, warehouseById } from "@/mocks/network";
import { productById } from "@/mocks/products";
import { api, apiOrThrow, authMode, contains, getScope, paginate, sortBy, type Scope } from "./core";

const severityRank: Record<Severity, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

/** Incidents this scope may see (mock mode). */
export function scopedIncidents(scope: Scope): MockIncident[] {
  if (scope.role === "distributor") return db.incidents.filter((i) => i.distributor_id === scope.distributorId);
  if (scope.role === "warehouse") return db.incidents.filter((i) => i.warehouse_id === scope.warehouseId);
  return db.incidents;
}

export function toListItem(i: MockIncident, role: Role): IncidentListItem {
  const d = distributorById(i.distributor_id)!;
  const p = productById(i.product_id)!;
  return {
    incident_id: i.incident_id,
    order_id: i.order_id,
    severity: i.severity,
    status: i.status,
    distributor: { id: d.id, name: d.name },
    product: { id: p.id, name: p.name, category: p.category },
    market: d.market,
    predicted_delay_days: i.cascade.predicted_delay_days,
    projected_arrival: i.cascade.projected_arrival,
    stockout_date: i.cascade.stockout_date,
    units_short: i.cascade.units_short,
    ...(role !== "distributor" && { money_at_risk_usd: i.cascade.money_at_risk_usd }),
    created_at: i.created_at,
    investigating: i.probable_cause === null,
  };
}

export function toDetail(i: MockIncident, role: Role): IncidentDetail {
  const d = distributorById(i.distributor_id)!;
  const p = productById(i.product_id)!;
  const product = { id: p.id, name: p.name, category: p.category };
  const order = { order_id: i.order_id, shipping_mode: i.shipping_mode, shipping_date: i.shipping_date, order_date: i.order_date, order_item_quantity: i.quantity };

  if (role === "distributor") {
    // Spec §5.2 / §7.2: no $, SHAP, evidence, options, internal briefing or decisions.
    const { days_of_cover, stockout_date, projected_arrival, predicted_delay_days, units_short } = i.cascade;
    return {
      incident_id: i.incident_id,
      status: i.status,
      severity: i.severity,
      order,
      product,
      cascade: { days_of_cover, stockout_date, projected_arrival, predicted_delay_days, units_short },
      briefing_text: i.briefing_distributor,
    };
  }
  const w = warehouseById(i.warehouse_id)!;
  return {
    incident_id: i.incident_id,
    status: i.status,
    severity: i.severity,
    created_at: i.created_at,
    order: { ...order, order_item_total: i.order_item_total },
    distributor: { id: d.id, name: d.name, market: d.market, segment: d.segment },
    warehouse: { id: w.id, name: w.name },
    product,
    cascade: { ...i.cascade },
    probable_cause: i.probable_cause,
    cause_confidence: i.cause_confidence,
    evidence: i.evidence,
    shap: i.shap,
    recommended_options: i.recommended_options,
    briefing_text: role === "warehouse" ? i.briefing_warehouse : i.briefing_ops,
    decisions: [...i.decisions],
  };
}

/** GET /api/incidents. Scope comes from the session; `distributor_id` is honoured for ops/data only. */
export async function listIncidents(params: IncidentListParams = {}): Promise<Page<IncidentListItem>> {
  const scope = await getScope();
  const global = scope.role === "ops" || scope.role === "data";
  if (authMode() === "api") {
    const { distributor_id, ...rest } = params;
    return apiOrThrow(scope, "/api/incidents", { query: { ...rest, ...(global && { distributor_id }) } });
  }
  let rows = scopedIncidents(scope)
    .map((i) => toListItem(i, scope.role))
    .filter(
      (r) =>
        (!params.status || r.status === params.status) &&
        (!params.severity || r.severity === params.severity) &&
        (!params.market || r.market === params.market) &&
        (!global || !params.distributor_id || r.distributor.id === params.distributor_id) &&
        contains([r.incident_id, r.order_id, r.distributor.name, r.product.name, r.market], params.q),
    );
  let sort: string = params.sort ?? "-money_at_risk_usd";
  if (scope.role === "distributor" && sort.endsWith("money_at_risk_usd")) sort = "stockout_date";
  rows = sortBy(rows, sort, (r, k) => (k === "severity" ? severityRank[r.severity] : (r[k as keyof IncidentListItem] as string | number | undefined)));
  return paginate(rows, params);
}

/** GET /api/incidents/{id}, role-shaped. null if it doesn't exist or is outside the user's scope. */
export async function getIncident(id: number): Promise<IncidentDetail | null> {
  const scope = await getScope();
  if (authMode() === "api") return api<IncidentDetail>(scope, `/api/incidents/${id}`);
  const i = scopedIncidents(scope).find((x) => x.incident_id === id);
  return i ? toDetail(i, scope.role) : null;
}

/** GET /api/decisions (History). Ops and data only. */
export async function listDecisions(params: DecisionListParams = {}): Promise<Page<DecisionLogItem>> {
  const scope = await getScope("ops", "data");
  if (authMode() === "api") return apiOrThrow(scope, "/api/decisions", { query: { ...params } });
  const rows = db.incidents
    .flatMap((i) =>
      i.decisions.map<DecisionLogItem>((d) => ({
        ...d,
        decision_id: d.decision_id!,
        incident_id: i.incident_id,
        order_id: i.order_id,
        option_title: i.recommended_options.find((o) => o.option_id === d.selected_option_id)?.title ?? null,
        outcome: i.status,
      })),
    )
    .filter(
      (d) =>
        (!params.action || d.action === params.action) &&
        (!params.from || d.decided_at.slice(0, 10) >= params.from) &&
        (!params.to || d.decided_at.slice(0, 10) <= params.to),
    )
    .sort((a, b) => b.decided_at.localeCompare(a.decided_at) || b.decision_id - a.decision_id);
  return paginate(rows, params);
}
