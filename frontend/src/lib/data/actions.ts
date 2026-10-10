"use server";

import { revalidatePath } from "next/cache";
import type { DecisionRequestAction, IncidentDetail } from "@/types/api";
import { api, ApiError, getScope } from "./core";

export interface DecideInput {
  action: DecisionRequestAction;
  /** Required for approve. */
  selectedOptionId?: string;
  /** Required for dismiss and escalate. */
  note?: string;
}

/** `status` mirrors the API: 403 wrong role, 404 not in scope, 409 already decided, 422 invalid input. */
export type DecideResult = { ok: true; incident: IncidentDetail } | { ok: false; status: 403 | 404 | 409 | 422 | 500; error: string };

const ACTIONS: DecisionRequestAction[] = ["approve", "dismiss", "escalate", "acknowledge"];

/** POST /api/incidents/{id}/decision. Approve / dismiss / escalate are ops only; acknowledge is the warehouse that owns the incident. */
export async function decideIncident(incidentId: number, input: DecideInput): Promise<DecideResult> {
  const scope = await getScope();
  const { action } = input;
  const note = input.note?.trim() || undefined;

  if (!ACTIONS.includes(action)) return { ok: false, status: 422, error: "Unknown action." };
  const allowed = action === "acknowledge" ? scope.role === "warehouse" : scope.role === "ops";
  if (!allowed) return { ok: false, status: 403, error: "You don't have permission to do that." };
  if (action === "approve" && !input.selectedOptionId) return { ok: false, status: 422, error: "Choose an option to approve." };
  if ((action === "dismiss" || action === "escalate") && !note) return { ok: false, status: 422, error: "Add a note explaining why." };

  try {
    await api(scope, `/api/incidents/${incidentId}/decision`, {
      method: "POST",
      body: { action, selected_option_id: input.selectedOptionId, note },
    });
    const incident = await api<IncidentDetail>(scope, `/api/incidents/${incidentId}`);
    if (!incident) return { ok: false, status: 404, error: "Incident not found." };
    revalidatePath("/", "layout");
    return { ok: true, incident };
  } catch (e) {
    // The API explains its rule failures (escalation required, note required, budget) in `detail`; show them as they are.
    if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return { ok: false, status: e.status as 403, error: e.message };
    return { ok: false, status: 500, error: "Something went wrong. Try again." };
  }
}

/** Warehouse "Acknowledge" (same endpoint, action = acknowledge). */
export async function acknowledgeIncident(incidentId: number): Promise<DecideResult> {
  return decideIncident(incidentId, { action: "acknowledge" });
}