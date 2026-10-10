import type { DecisionListParams, DecisionLogItem, IncidentDetail, IncidentListItem, IncidentListParams, Page } from "@/types/api";
import { api, apiOrThrow, getScope } from "./core";

/** GET /api/incidents. Scope comes from the session; `distributor_id` is honoured for ops/data only. */
export async function listIncidents(params: IncidentListParams = {}): Promise<Page<IncidentListItem>> {
  const scope = await getScope();
  const global = scope.role === "ops" || scope.role === "data";
  const { distributor_id, ...rest } = params;
  return apiOrThrow(scope, "/api/incidents", { query: { ...rest, ...(global && { distributor_id }) } });
}

/** GET /api/incidents/{id}, role-shaped. null if it doesn't exist or is outside the user's scope. */
export async function getIncident(id: number): Promise<IncidentDetail | null> {
  const scope = await getScope();
  return api<IncidentDetail>(scope, `/api/incidents/${id}`);
}

/** GET /api/decisions (History). Ops and data only. */
export async function listDecisions(params: DecisionListParams = {}): Promise<Page<DecisionLogItem>> {
  const scope = await getScope("ops", "data");
  return apiOrThrow(scope, "/api/decisions", { query: { ...params } });
}