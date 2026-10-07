import type { AgentStats, ModelSummary, ObservabilityHub, PipelineStatus } from "@/types/api";
import { db } from "@/mocks/db";
import { agentStats, hub, models, pipeline } from "@/mocks/observability";
import { orders } from "@/mocks/orders";
import { apiOrThrow, authMode, getScope } from "./core";
import { isOpen } from "./ops";

// Observability endpoints (spec §7.6), role `data` only.

/** GET /api/observability. */
export async function getObservability(): Promise<ObservabilityHub> {
  const scope = await getScope("data");
  if (authMode() === "api") return apiOrThrow(scope, "/api/observability");
  return {
    ...hub,
    summary: {
      total_orders: orders.length,
      total_predictions: orders.length,
      active_incidents: db.incidents.filter(isOpen).length,
      models_trained: { m1: "active", m2: "active" },
    },
  };
}

/** GET /api/observability/models. */
export async function getModels(): Promise<ModelSummary[]> {
  const scope = await getScope("data");
  if (authMode() === "api") return apiOrThrow(scope, "/api/observability/models");
  return models;
}

/** GET /api/observability/pipeline. */
export async function getPipeline(): Promise<PipelineStatus> {
  const scope = await getScope("data");
  if (authMode() === "api") return apiOrThrow(scope, "/api/observability/pipeline");
  return pipeline;
}

/** GET /api/observability/agent. */
export async function getAgentStats(): Promise<AgentStats> {
  const scope = await getScope("data");
  if (authMode() === "api") return apiOrThrow(scope, "/api/observability/agent");
  return agentStats;
}
