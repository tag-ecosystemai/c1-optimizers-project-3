import type { InventoryListParams, InventoryRow, Page, WarehouseOverview } from "@/types/api";
import { apiOrThrow, getScope } from "./core";

/** GET /api/warehouse/overview. */
export async function getWarehouseOverview(): Promise<WarehouseOverview> {
  const scope = await getScope("warehouse");
  return apiOrThrow(scope, "/api/warehouse/overview");
}

/** GET /api/warehouse/inventory, lowest cover first by default. */
export async function listWarehouseInventory(params: InventoryListParams = {}): Promise<Page<InventoryRow>> {
  const scope = await getScope("warehouse");
  return apiOrThrow(scope, "/api/warehouse/inventory", { query: { ...params } });
}