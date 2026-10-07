import type { InventoryListParams, InventoryRow, Page, Severity, WarehouseOverview } from "@/types/api";
import { db } from "@/mocks/db";
import { inventory, LOW_COVER_DAYS } from "@/mocks/inventory";
import { AS_OF_DATE, distributors, warehouseById } from "@/mocks/network";
import { productById } from "@/mocks/products";
import { apiOrThrow, authMode, contains, getScope, paginate, sortBy } from "./core";
import { isOpen } from "./ops";

// Warehouse endpoints (spec §7.5). Scope is the session's warehouse (or the warehouse ops is viewing as).

const rank: Record<Severity, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

/** GET /api/warehouse/overview. */
export async function getWarehouseOverview(): Promise<WarehouseOverview> {
  const scope = await getScope("warehouse");
  if (authMode() === "api") return apiOrThrow(scope, "/api/warehouse/overview");

  const w = warehouseById(scope.warehouseId!)!;
  const open = db.incidents.filter((i) => i.warehouse_id === w.id && isOpen(i));
  const rows = inventory.filter((r) => r.warehouse_id === w.id);
  const served = distributors
    .filter((d) => d.warehouse_id === w.id)
    .map((d) => {
      const xs = open.filter((i) => i.distributor_id === d.id);
      return {
        id: d.id,
        name: d.name,
        segment: d.segment,
        open_incidents: xs.length,
        money_at_risk_usd: xs.reduce((s, i) => s + i.cascade.money_at_risk_usd, 0),
        status: xs.reduce<Severity>((s, i) => (rank[i.severity] > rank[s] ? i.severity : s), "NONE"),
      };
    });
  return {
    warehouse: { id: w.id, name: w.name, market: w.market },
    kpis: {
      open_incidents: open.length,
      low_cover_skus: rows.filter((r) => r.days_of_cover < LOW_COVER_DAYS).length,
      low_cover_threshold_days: LOW_COVER_DAYS,
      stock_units: rows.reduce((s, r) => s + r.stock_on_hand, 0),
      distributors_affected: served.filter((d) => d.open_incidents > 0).length,
      money_at_risk_usd: open.reduce((s, i) => s + i.cascade.money_at_risk_usd, 0),
    },
    distributors: served,
  };
}

/** GET /api/warehouse/inventory, lowest cover first by default. */
export async function listWarehouseInventory(params: InventoryListParams = {}): Promise<Page<InventoryRow>> {
  const scope = await getScope("warehouse");
  if (authMode() === "api") return apiOrThrow(scope, "/api/warehouse/inventory", { query: { ...params } });

  const w = warehouseById(scope.warehouseId!)!;
  const rows = inventory
    .filter((r) => r.warehouse_id === w.id)
    .map<InventoryRow>((r) => {
      const p = productById(r.product_id)!;
      return {
        product: { id: p.id, name: p.name, category: p.category },
        warehouse: { id: w.id, name: w.name },
        stock_on_hand: r.stock_on_hand,
        as_of_date: AS_OF_DATE,
        weekly_usage: r.weekly_usage,
        days_of_cover: r.days_of_cover,
        stockout_date: r.stockout_date,
        severity: r.severity,
      };
    })
    .filter(
      (r) =>
        (!params.category || r.product.category === params.category) &&
        (!params.severity || r.severity === params.severity) &&
        contains([r.product.name, r.product.category ?? ""], params.q),
    );
  return paginate(
    sortBy(rows, params.sort ?? "days_of_cover", (r, k) => r[k as "days_of_cover" | "stock_on_hand"]),
    params,
  );
}
