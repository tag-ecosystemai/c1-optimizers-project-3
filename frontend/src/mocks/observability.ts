import type { AgentStats, ModelSummary, ObservabilityHub, PipelineStatus } from "@/types/api";
import { AS_OF_DATE } from "./network";

export const hub: Omit<ObservabilityHub, "summary"> = {
  status: "all_systems_operational",
  last_updated: AS_OF_DATE,
  links: {
    langfuse: { url: "https://cloud.langfuse.com", label: "Agent Traces", description: "View every agent tool call, cost, and latency", status: "connected" },
    dagshub: { url: "https://dagshub.com/RunOut/runout-ml", label: "MLflow / Model Registry", description: "Training runs, model comparison, champion promotion", status: "connected" },
    grafana: { url: "https://grafana.com", label: "Grafana Dashboard", description: "System health, data drift, ingestion metrics", status: "not_configured" },
    supabase: { url: "https://supabase.com/dashboard", label: "Supabase Database", description: "Raw data: orders, inventory, signals, predictions", status: "connected" },
  },
};

const mlflow = (run: string) => `https://dagshub.com/RunOut/runout-ml.mlflow/#/runs/${run}`;

export const models: ModelSummary[] = [
  {
    key: "m1",
    name: "M1 delay model",
    target: "Days an order will arrive late",
    champion: { run_id: "a91f3c", version: "v7", algorithm: "Gradient boosting (LightGBM)", mae: 1.12, rmse: 1.68, r2: 0.71, trained_at: "2017-02-28T23:10:00Z", status: "champion", mlflow_url: mlflow("a91f3c") },
    runs: [
      { run_id: "a91f3c", version: "v7", algorithm: "Gradient boosting (LightGBM)", mae: 1.12, rmse: 1.68, r2: 0.71, trained_at: "2017-02-28T23:10:00Z", status: "champion", mlflow_url: mlflow("a91f3c") },
      { run_id: "7c20de", version: "v7-rf", algorithm: "Random forest", mae: 1.31, rmse: 1.9, r2: 0.64, trained_at: "2017-02-28T23:02:00Z", status: "challenger", mlflow_url: mlflow("7c20de") },
      { run_id: "52be11", version: "v6", algorithm: "Gradient boosting (LightGBM)", mae: 1.19, rmse: 1.74, r2: 0.69, trained_at: "2017-02-21T23:08:00Z", status: "archived", mlflow_url: mlflow("52be11") },
      { run_id: "0d93aa", version: "v6-xgb", algorithm: "XGBoost", mae: 0, rmse: 0, r2: 0, trained_at: "2017-02-21T22:55:00Z", status: "failed", mlflow_url: mlflow("0d93aa") },
    ],
  },
  {
    key: "m2",
    name: "M2 usage forecast",
    target: "Units each distributor uses per week",
    champion: { run_id: "e4417b", version: "v3", algorithm: "Prophet + gradient boosting residuals", mae: 6.4, rmse: 9.1, r2: 0.82, trained_at: "2017-02-28T23:40:00Z", status: "champion", mlflow_url: mlflow("e4417b") },
    runs: [
      { run_id: "e4417b", version: "v3", algorithm: "Prophet + gradient boosting residuals", mae: 6.4, rmse: 9.1, r2: 0.82, trained_at: "2017-02-28T23:40:00Z", status: "champion", mlflow_url: mlflow("e4417b") },
      { run_id: "c6a0f2", version: "v2", algorithm: "Prophet", mae: 7.9, rmse: 11.3, r2: 0.76, trained_at: "2017-02-14T23:35:00Z", status: "archived", mlflow_url: mlflow("c6a0f2") },
    ],
  },
];

export const pipeline: PipelineStatus = {
  last_run_at: "2017-03-01T06:00:00Z",
  status: "ok",
  stages: [
    { key: "seed", name: "Seed orders and inventory", status: "ok", last_run_at: "2017-03-01T05:40:00Z", rows: 180_519, duration_s: 212 },
    { key: "features", name: "Build model features", status: "ok", last_run_at: "2017-03-01T05:44:00Z", rows: 180_519, duration_s: 96 },
    { key: "scoring", name: "Score open orders (M1, M2)", status: "ok", last_run_at: "2017-03-01T05:52:00Z", rows: 4_212, duration_s: 41 },
    { key: "cascade", name: "Cascade to stockouts", status: "ok", last_run_at: "2017-03-01T06:00:00Z", rows: 18, duration_s: 7 },
  ],
  freshness: { max_order_date: "2017-02-28", max_scored_at: "2017-03-01T05:52:00Z" },
  failed_runs: [{ run_id: "pl-0226", stage: "features", failed_at: "2017-02-26T05:43:00Z", error: "Null shipping_mode in 312 rows from the Feb 25 load" }],
  drift_flags: [
    { feature: "days_for_shipment_scheduled", metric: "PSI", value: 0.08, threshold: 0.2, flagged: false },
    { feature: "order_region", metric: "PSI", value: 0.24, threshold: 0.2, flagged: true },
    { feature: "order_item_quantity", metric: "PSI", value: 0.05, threshold: 0.2, flagged: false },
  ],
};

export const agentStats: AgentStats = {
  period: "Last 24 hours",
  runs: 37,
  avg_latency_s: 4.2,
  avg_cost_usd: 0.031,
  error_rate: 0,
  tool_calls: [
    { name: "search_news", label: "Searched news", count: 41 },
    { name: "get_weather", label: "Checked weather", count: 29 },
    { name: "check_inventory", label: "Checked inventory", count: 37 },
    { name: "find_alternative_warehouse", label: "Found alternative warehouses", count: 22 },
    { name: "draft_options", label: "Drafted options", count: 37 },
  ],
  traces_url: "https://cloud.langfuse.com",
  recent: [
    { incident_id: 812, order_id: 55123, investigated_at: "2017-03-01T06:04:00Z", latency_s: 5.1, cost_usd: 0.038, status: "ok", probable_cause: "Port strike at Santos" },
    { incident_id: 816, order_id: 55116, investigated_at: "2017-03-01T06:03:00Z", latency_s: 3.9, cost_usd: 0.029, status: "ok", probable_cause: "Fuel shortage slowing trucking out of Lagos" },
    { incident_id: 803, order_id: 55103, investigated_at: "2017-02-28T06:05:00Z", latency_s: 4.4, cost_usd: 0.033, status: "ok", probable_cause: "Fuel shortage slowing trucking out of Lagos" },
    { incident_id: 817, order_id: 55117, investigated_at: "2017-02-28T06:02:00Z", latency_s: 3.6, cost_usd: 0.027, status: "ok", probable_cause: "Snow delaying road freight through Bavaria" },
    { incident_id: 808, order_id: 55108, investigated_at: "2017-02-27T06:03:00Z", latency_s: 4.0, cost_usd: 0.03, status: "ok", probable_cause: "Carrier capacity shortfall on Sydney routes" },
  ],
};
