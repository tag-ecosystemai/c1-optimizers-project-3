import type { MyOrder, MyOrderDetail, MyOrderListParams, MyOverview, MyStockRow, Page } from "@/types/api";
import { api, apiOrThrow, getScope } from "./core";

// Distributor endpoints. Scope is the session's distributor (or the one ops is viewing as); no dollar fields ever leave the API.

/** GET /api/my/overview. */
export async function getMyOverview(): Promise<MyOverview> {
  const scope = await getScope("distributor");
  return apiOrThrow(scope, "/api/my/overview");
}

/** GET /api/my/orders, newest first. */
export async function listMyOrders(params: MyOrderListParams = {}): Promise<Page<MyOrder>> {
  const scope = await getScope("distributor");
  return apiOrThrow(scope, "/api/my/orders", { query: { ...params } });
}

/** GET /api/my/orders/{id}. null if it isn't this distributor's order. */
export async function getMyOrder(orderId: number): Promise<MyOrderDetail | null> {
  const scope = await getScope("distributor");
  return api<MyOrderDetail>(scope, `/api/my/orders/${orderId}`);
}

/** GET /api/my/stock, lowest cover first. */
export async function getMyStock(): Promise<MyStockRow[]> {
  const scope = await getScope("distributor");
  const r = await apiOrThrow<{ items: MyStockRow[] }>(scope, "/api/my/stock");
  return r.items;
}