import { redirect } from "next/navigation";
import type { NetworkWarehouse, OpsSummary } from "@/types/api";
import { homeFor } from "@/lib/auth/routes";
import { apiOrThrow, getScope } from "./core";

/** GET /api/ops/summary. Ops only. */
export async function getOpsSummary(): Promise<OpsSummary> {
  const scope = await getScope("ops");
  return apiOrThrow(scope, "/api/ops/summary");
}

/** GET /api/ops/network. Ops only (also used to resolve View as targets, so it ignores View as). */
export async function getOpsNetwork(): Promise<NetworkWarehouse[]> {
  const scope = await getScope();
  if (scope.session.role !== "ops") redirect(homeFor(scope.session.role));
  return apiOrThrow(scope, "/api/ops/network", { ignoreViewAs: true });
}