"use server";

import { revalidatePath } from "next/cache";
import type { DecisionAction, DecisionRequestAction, IncidentDetail } from "@/types/api";
import { db } from "@/mocks/db";
import { AS_OF_DATE } from "@/mocks/network";
import { api, ApiError, authMode, getScope } from "./core";
import { scopedIncidents, toDetail } from "./incidents";

// Mutations (spec §7.2). View as switching lives in lib/auth/actions.ts (viewAs / exitViewAs).

export interface DecideInput {
  action: DecisionRequestAction;
  /** Required for approve. */
  selectedOptionId?: string;
  /** Required for dismiss and escalate. */
  note?: string;
}

/** `status` mirrors the API: 403 wrong role, 404 not in scope, 409 already decided, 422 invalid input. */
export type DecideResult = { ok: true; incident: IncidentDetail } | { ok: false; status: 403 | 404 | 409 | 422 | 500; error: string };

const past: Record<DecisionRequestAction, DecisionAction> = {
  approve: "approved",
  dismiss: "dismissed",
  escalate: "escalated",
  acknowledge: "acknowledged",
};

/**
 * POST /api/incidents/{id}/decision. Approve / dismiss / escalate are ops only; acknowledge is the
 * warehouse that owns the incident. In mock mode it updates the in-memory incidents, then revalidates.
 */
export async function decideIncident(incidentId: number, input: DecideInput): Promise<DecideResult> {
  const scope = await getScope();
  const { action } = input;
  const note = input.note?.trim() || undefined;

  if (!(action in past)) return { ok: false, status: 422, error: "Unknown action." };
  const allowed = action === "acknowledge" ? scope.role === "warehouse" : scope.role === "ops";
  if (!allowed) return { ok: false, status: 403, error: "You don't have permission to do that." };
  if (action === "approve" && !input.selectedOptionId) return { ok: false, status: 422, error: "Choose an option to approve." };
  if ((action === "dismiss" || action === "escalate") && !note) return { ok: false, status: 422, error: "Add a note explaining why." };

  if (authMode() === "api") {
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
      if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return { ok: false, status: e.status as 403, error: e.message };
      return { ok: false, status: 500, error: "Something went wrong. Try again." };
    }
  }

  const incident = scopedIncidents(scope).find((i) => i.incident_id === incidentId);
  if (!incident) return { ok: false, status: 404, error: "Incident not found." };

  if (action === "acknowledge") {
    const prior = incident.decisions.find((d) => d.action === "acknowledged");
    if (prior) return { ok: false, status: 409, error: `Already acknowledged by ${prior.by}.` };
  } else {
    // open → approved | dismissed | escalated; escalated can still be approved or dismissed.
    const decidable = incident.status === "open" || (incident.status === "escalated" && action !== "escalate");
    if (!decidable) {
      const last = [...incident.decisions].reverse().find((d) => d.action !== "acknowledged");
      return { ok: false, status: 409, error: last ? `Already ${last.action} by ${last.by}.` : `This incident is already ${incident.status}.` };
    }
    if (action === "approve" && !incident.recommended_options.some((o) => o.option_id === input.selectedOptionId)) {
      return { ok: false, status: 422, error: "That option doesn't exist on this incident." };
    }
    incident.status = past[action] as "approved" | "dismissed" | "escalated";
  }

  incident.decisions.push({
    decision_id: db.nextDecisionId++,
    action: past[action],
    by: scope.session.name,
    note: note ?? null,
    selected_option_id: action === "approve" ? input.selectedOptionId : null,
    // The demo world is frozen at the as-of date; keep the real time of day.
    decided_at: `${AS_OF_DATE}T${new Date().toISOString().slice(11)}`,
  });
  revalidatePath("/", "layout");
  return { ok: true, incident: toDetail(incident, scope.role) };
}

/** Warehouse "Acknowledge" (same endpoint, action = acknowledge). */
export async function acknowledgeIncident(incidentId: number): Promise<DecideResult> {
  return decideIncident(incidentId, { action: "acknowledge" });
}
