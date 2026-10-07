import type { Me } from "@/types/api";
import { AS_OF_DATE } from "@/mocks/network";
import { userById } from "@/mocks/users";
import { apiOrThrow, authMode, getScope } from "./core";

/** GET /api/me: the signed-in user's own profile (not the View as target). */
export async function getMe(): Promise<Me> {
  const scope = await getScope();
  const s = scope.session;
  if (authMode() === "api") return apiOrThrow(scope, "/api/me", { ignoreViewAs: true });
  return (
    userById(s.userId) ?? {
      user_id: s.userId,
      email: s.email,
      role: s.role,
      display_name: s.name,
      distributor_id: s.distributorId,
      warehouse_id: s.warehouseId,
    }
  );
}

/**
 * "Today" for every countdown (`YYYY-MM-DD`). The data is DataCo history, so never use the browser clock.
 * Async so the api branch can read it from the backend later without changing callers.
 */
export async function asOfDate(): Promise<string> {
  return process.env.AS_OF_DATE ?? AS_OF_DATE;
}
