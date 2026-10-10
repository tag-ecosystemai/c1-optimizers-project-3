import type { AgentStats, ModelSummary, ObservabilityHub, PipelineStatus } from "@/types/api";
import { apiOrThrow, getScope } from "./core";

// Observability endpoints, role `data` only.
export async function getObservability(): Promise<ObservabilityHub> {
  return apiOrThrow(await getScope("data"), "/api/observability");
}
export async function getModels(): Promise<ModelSummary[]> {
  return apiOrThrow(await getScope("data"), "/api/observability/models");
}
export async function getPipeline(): Promise<PipelineStatus> {
  return apiOrThrow(await getScope("data"), "/api/observability/pipeline");
}
export async function getAgentStats(): Promise<AgentStats> {
  return apiOrThrow(await getScope("data"), "/api/observability/agent");
}