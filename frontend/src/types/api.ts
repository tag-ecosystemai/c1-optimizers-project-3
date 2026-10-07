// Response shapes from docs/FRONTEND_SPEC.md §7 (and §8 for Ask). Field names match the API (snake_case).
// Optional fields are ones some roles do not receive (e.g. distributors never get dollar fields):
// render what is present, never branch on role.

export type Role = "ops" | "warehouse" | "distributor" | "data";
export type Market = "Europe" | "USCA" | "LATAM" | "Africa" | "Pacific Asia";
export type Segment = "Consumer" | "Corporate" | "Home Office";
export type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type IncidentStatus = "open" | "approved" | "dismissed" | "escalated" | "resolved";
/** What a decision log entry records. */
export type DecisionAction = "approved" | "dismissed" | "escalated" | "acknowledged";
/** What the client sends to POST /api/incidents/{id}/decision. */
export type DecisionRequestAction = "approve" | "dismiss" | "escalate" | "acknowledge";
export type ShippingMode = "Standard Class" | "Second Class" | "First Class" | "Same Day";
export type OrderStatus = "processing" | "in_transit" | "delivered";
/** ISO date `YYYY-MM-DD`. */
export type ISODate = string;
/** ISO 8601 UTC timestamp. */
export type ISODateTime = string;

export interface Ref {
  id: number;
  name: string;
}

export interface ProductRef extends Ref {
  category?: string;
}

/** Cursor-paginated list. `next_cursor` is null on the last page. */
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  prev_cursor?: string | null;
  total?: number;
}

/** `{ "detail": "message" }` error body. */
export interface ApiErrorBody {
  detail: string;
}

// §7.1 Auth and profile

export interface Me {
  user_id: string;
  email: string;
  role: Role;
  display_name: string;
  distributor_id: number | null;
  warehouse_id: number | null;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: Role;
    display_name?: string | null;
    distributor_id?: number | null;
    warehouse_id?: number | null;
  };
}

// §7.2 Incidents

export interface IncidentListItem {
  incident_id: number;
  order_id: number;
  severity: Severity;
  status: IncidentStatus;
  distributor: Ref;
  product: ProductRef;
  market: Market;
  predicted_delay_days: number;
  projected_arrival: ISODate;
  stockout_date: ISODate;
  units_short: number;
  /** Omitted for distributors. */
  money_at_risk_usd?: number;
  created_at: ISODateTime;
  /** True while the agent has not written a probable cause yet. */
  investigating?: boolean;
  /** True once the owning warehouse has acknowledged it. Omitted for distributors. */
  acknowledged_by_warehouse?: boolean;
}

/** `sort` param: a field name, prefixed with `-` for descending. */
export type IncidentSortKey =
  | "money_at_risk_usd"
  | "predicted_delay_days"
  | "stockout_date"
  | "units_short"
  | "created_at"
  | "severity";
export type IncidentSort = IncidentSortKey | `-${IncidentSortKey}`;

export interface IncidentListParams {
  status?: IncidentStatus;
  severity?: Severity;
  market?: Market;
  /** Ops/data only; ignored for scoped roles. */
  distributor_id?: number;
  q?: string;
  sort?: IncidentSort;
  limit?: number;
  cursor?: string;
}

export interface Cascade {
  days_of_cover: number;
  stockout_date: ISODate;
  projected_arrival: ISODate;
  predicted_delay_days: number;
  units_short: number;
  /** Omitted for distributors. */
  delay_risk_score?: number;
  /** Omitted for distributors. */
  money_at_risk_usd?: number;
}

export interface Evidence {
  type: "news" | "weather" | "data";
  source: string;
  summary: string;
  url?: string | null;
  timestamp: ISODateTime;
}

export interface ShapFactor {
  feature: string;
  /** Days added (positive) or removed (negative) from the predicted delay. */
  contribution: number;
  /** Plain-words label, e.g. "Second Class shipping". */
  label?: string;
}

export interface RecommendedOption {
  option_id: string;
  type: "expedite" | "transfer" | "split_shipment" | "notify_only";
  title: string;
  description: string;
  cost_usd?: number;
  eta_days?: number;
  units_covered: number;
  recommended: boolean;
}

/** One entry in an incident's activity log. */
export interface Decision {
  decision_id?: number;
  action: DecisionAction;
  by: string;
  note: string | null;
  selected_option_id?: string | null;
  decided_at: ISODateTime;
}

export interface IncidentDetail {
  incident_id: number;
  status: IncidentStatus;
  severity: Severity;
  created_at?: ISODateTime;
  order: {
    order_id: number;
    shipping_mode: ShippingMode;
    shipping_date: ISODate;
    order_date?: ISODate;
    order_item_quantity: number;
    /** Omitted for distributors. */
    order_item_total?: number;
  };
  distributor?: { id: number; name: string; market: Market; segment: Segment };
  warehouse?: Ref;
  product: ProductRef;
  cascade: Cascade;
  /** null while the agent is still investigating (poll every ~10 s). */
  probable_cause?: string | null;
  cause_confidence?: number | null;
  evidence?: Evidence[];
  shap?: ShapFactor[];
  recommended_options?: RecommendedOption[];
  /** Role-shaped: ops, warehouse or distributor-safe briefing. */
  briefing_text: string | null;
  decisions?: Decision[];
}

export interface DecisionRequest {
  action: DecisionRequestAction;
  selected_option_id?: string;
  note?: string;
}

/** Row of the decision log (GET /api/decisions, History page). */
export interface DecisionLogItem extends Decision {
  decision_id: number;
  incident_id: number;
  order_id: number;
  option_title: string | null;
  /** The incident's current status, i.e. the outcome. */
  outcome: IncidentStatus;
}

export interface DecisionListParams {
  action?: DecisionAction;
  /** Inclusive `YYYY-MM-DD` bounds on decided_at. */
  from?: ISODate;
  to?: ISODate;
  limit?: number;
  cursor?: string;
}

// §7.3 Ops dashboards

export interface OpsKpis {
  open_incidents: number;
  money_at_risk_usd: number;
  /** Share (0–1) of scored orders above the delay-risk threshold. */
  late_risk_rate: number;
  units_short: number;
  avg_predicted_delay_days: number;
}

export interface OpsSummary extends OpsKpis {
  by_market: { market: Market; money_at_risk_usd: number; open_incidents: number }[];
  top_products: { product: ProductRef; money_at_risk_usd: number; open_incidents: number }[];
  trend: { date: ISODate; opened: number }[];
  /** Same KPIs one day earlier, for "vs. yesterday" deltas. */
  yesterday?: OpsKpis;
}

export interface NetworkDistributor {
  id: number;
  name: string;
  segment: Segment;
  open_incidents: number;
  money_at_risk_usd?: number;
  low_cover_skus?: number;
}

export interface NetworkWarehouse {
  warehouse: { id: number; name: string; market: Market };
  open_incidents: number;
  money_at_risk_usd: number;
  low_cover_skus: number;
  distributors: NetworkDistributor[];
}

// §7.4 Distributor

export interface MyOrder {
  order_id: number;
  product: ProductRef;
  quantity: number;
  order_date: ISODate;
  shipping_mode: ShippingMode;
  status: OrderStatus;
  original_eta: ISODate;
  predicted_eta: ISODate;
  predicted_delay_days: number;
  risk: Severity;
  incident_id: number | null;
}

export interface MyOrderListParams {
  status?: OrderStatus;
  risk?: Severity;
  shipping_mode?: ShippingMode;
  /** Inclusive `YYYY-MM-DD` bounds on order_date. */
  from?: ISODate;
  to?: ISODate;
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface TimelineEvent {
  key: "ordered" | "shipped" | "original_eta" | "predicted_eta" | "stockout";
  label: string;
  date: ISODate;
  /** done = in the past, upcoming = expected, warning = a problem date (late ETA, stockout). */
  state: "done" | "upcoming" | "warning";
}

export interface MyOrderDetail extends MyOrder {
  shipping_date: ISODate;
  timeline: TimelineEvent[];
  /** Cover for this product; null when no stockout is projected. */
  cover: Cascade | null;
  briefing_text: string | null;
}

export interface MyOverview {
  kpis: {
    orders_in_transit: number;
    orders_predicted_late: number;
    products_at_risk: number;
    nearest_stockout_date: ISODate | null;
  };
  /** Top at-risk orders (max 5), no dollar fields. */
  needs_attention: IncidentListItem[];
  recent_activity: { date: ISODate; order_id: number; text: string }[];
}

export interface MyStockRow {
  product: ProductRef;
  weekly_usage_forecast: number;
  days_of_cover: number;
  stockout_date: ISODate | null;
  severity: Severity;
  /** Weekly order quantity, oldest first (for a sparkline). */
  weekly_history?: number[];
}

// §7.5 Warehouse

export interface WarehouseOverview {
  warehouse: { id: number; name: string; market: Market };
  kpis: {
    open_incidents: number;
    low_cover_skus: number;
    /** The N in "SKUs under N days of cover". */
    low_cover_threshold_days: number;
    stock_units: number;
    distributors_affected: number;
    money_at_risk_usd?: number;
  };
  distributors: (NetworkDistributor & { status: Severity })[];
}

export interface InventoryRow {
  product: ProductRef;
  warehouse: Ref;
  stock_on_hand: number;
  as_of_date: ISODate;
  weekly_usage: number;
  days_of_cover: number;
  stockout_date: ISODate | null;
  severity: Severity;
}

export interface InventoryListParams {
  category?: string;
  severity?: Severity;
  q?: string;
  sort?: "days_of_cover" | "-days_of_cover" | "stock_on_hand" | "-stock_on_hand";
  limit?: number;
  cursor?: string;
}

// §7.6 Observability (role data)

export type HubLinkKey = "langfuse" | "dagshub" | "grafana" | "supabase";

export interface ObservabilityHub {
  status: string;
  last_updated: ISODate;
  links: Record<HubLinkKey, { url: string; label: string; description: string; status: "connected" | "not_configured" }>;
  summary: {
    total_orders: number;
    total_predictions: number;
    active_incidents: number;
    models_trained: Record<"m1" | "m2", "active" | "pending">;
  };
}

export interface ModelRun {
  run_id: string;
  version: string;
  algorithm: string;
  mae: number;
  rmse: number;
  r2: number;
  trained_at: ISODateTime;
  status: "champion" | "challenger" | "archived" | "failed";
  mlflow_url: string | null;
}

export interface ModelSummary {
  key: "m1" | "m2";
  name: string;
  /** What the model predicts, in plain words. */
  target: string;
  champion: ModelRun | null;
  runs: ModelRun[];
}

export interface PipelineStage {
  key: "seed" | "features" | "scoring" | "cascade";
  name: string;
  status: "ok" | "failed" | "running" | "pending";
  last_run_at: ISODateTime | null;
  rows: number;
  duration_s: number | null;
}

export interface PipelineStatus {
  last_run_at: ISODateTime;
  status: "ok" | "failed" | "running";
  stages: PipelineStage[];
  freshness: { max_order_date: ISODate; max_scored_at: ISODateTime };
  failed_runs: { run_id: string; stage: PipelineStage["key"]; failed_at: ISODateTime; error: string }[];
  drift_flags: { feature: string; metric: string; value: number; threshold: number; flagged: boolean }[];
}

export interface AgentStats {
  period: string;
  runs: number;
  avg_latency_s: number;
  avg_cost_usd: number;
  error_rate: number;
  tool_calls: { name: string; label: string; count: number }[];
  traces_url: string | null;
  recent: {
    incident_id: number;
    order_id: number;
    investigated_at: ISODateTime;
    latency_s: number;
    cost_usd: number;
    status: "ok" | "error";
    probable_cause: string | null;
  }[];
}

// §8.2 Ask (POST /api/ask, Server-Sent Events)

export interface AskRequest {
  query: string;
  session_id: string | null;
  incident_id?: number | null;
}

export interface AskSource {
  type: "incident" | "order" | "inventory" | "model" | "news" | "pipeline";
  label: string;
  href?: string;
}

export type AskEvent =
  | { event: "session"; data: { session_id: string } }
  | { event: "tool_call"; data: { name: string; status: "started" | "done"; label: string } }
  | { event: "token"; data: { text: string } }
  | { event: "final"; data: { message_id: string; sources: AskSource[] } }
  | { event: "error"; data: { message: string } };
