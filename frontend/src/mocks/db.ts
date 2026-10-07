import { buildIncidents, type MockIncident } from "./incidents";

// Mutable incident state for mock mode, so decisions show up across the running server.
// Kept on globalThis so dev hot reloads don't reset it. Restarting the server resets the demo.
const g = globalThis as typeof globalThis & { __runoutMockDb?: { incidents: MockIncident[]; nextDecisionId: number } };

export const db = (g.__runoutMockDb ??= (() => {
  const incidents = buildIncidents();
  const nextDecisionId = Math.max(0, ...incidents.flatMap((i) => i.decisions.map((d) => d.decision_id ?? 0))) + 1;
  return { incidents, nextDecisionId };
})());
