import { redirect } from "next/navigation";
import type { Market, NetworkWarehouse, OpsKpis, OpsSummary } from "@/types/api";
import { db } from "@/mocks/db";
import type { MockIncident } from "@/mocks/incidents";
import { inventory, LOW_COVER_DAYS, stock } from "@/mocks/inventory";
import { AS_OF_DATE, distributorById, distributors, warehouses } from "@/mocks/network";
import { orders } from "@/mocks/orders";
import { productById } from "@/mocks/products";
import { addDays } from "@/lib/format";
import { homeFor } from "@/lib/auth/routes";
import { apiOrThrow, authMode, getScope } from "./core";

/** "Open" on dashboards = still needs a decision (open or escalated). */
export const isOpen = (i: MockIncident) => i.status === "open" || i.status === "escalated";
const money = (xs: MockIncident[]) => xs.reduce((s, i) => s + i.cascade.money_at_risk_usd, 0);

/** Share of undelivered scored orders whose delay risk is above this threshold. */
const LATE_RISK_THRESHOLD = 0.7;

function kpis(incidents: MockIncident[]): OpsKpis {
  const open = incidents.filter(isOpen);
  const live = orders.filter((o) => o.status !== "delivered");
  return {
    open_incidents: open.length,
    money_at_risk_usd: money(open),
    late_risk_rate: live.length ? live.filter((o) => o.delay_risk_score > LATE_RISK_THRESHOLD).length / live.length : 0,
    units_short: open.reduce((s, i) => s + i.cascade.units_short, 0),
    avg_predicted_delay_days: open.length ? Math.round((open.reduce((s, i) => s + i.cascade.predicted_delay_days, 0) / open.length) * 10) / 10 : 0,
  };
}

/** GET /api/ops/summary. Ops only. */
export async function getOpsSummary(): Promise<OpsSummary> {
  const scope = await getScope("ops");
  if (authMode() === "api") return apiOrThrow(scope, "/api/ops/summary");

  const open = db.incidents.filter(isOpen);
  const markets: Market[] = ["Europe", "USCA", "LATAM", "Africa", "Pacific Asia"];
  const byProduct = new Map<number, MockIncident[]>();
  for (const i of open) byProduct.set(i.product_id, [...(byProduct.get(i.product_id) ?? []), i]);

  return {
    ...kpis(db.incidents),
    by_market: markets.map((market) => {
      const xs = open.filter((i) => distributorById(i.distributor_id)!.market === market);
      return { market, money_at_risk_usd: money(xs), open_incidents: xs.length };
    }),
    top_products: [...byProduct.entries()]
      .map(([pid, xs]) => {
        const p = productById(pid)!;
        return { product: { id: p.id, name: p.name, category: p.category }, money_at_risk_usd: money(xs), open_incidents: xs.length };
      })
      .sort((a, b) => b.money_at_risk_usd - a.money_at_risk_usd)
      .slice(0, 5),
    trend: Array.from({ length: 14 }, (_, k) => {
      const day = addDays(AS_OF_DATE, k - 13);
      return { date: day, opened: db.incidents.filter((i) => i.created_at.startsWith(day)).length };
    }),
    yesterday: kpis(db.incidents.filter((i) => i.created_at.slice(0, 10) < AS_OF_DATE)),
  };
}

/** GET /api/ops/network. Ops only (also used to resolve View as targets, so it ignores View as). */
export async function getOpsNetwork(): Promise<NetworkWarehouse[]> {
  const scope = await getScope();
  if (scope.session.role !== "ops") redirect(homeFor(scope.session.role));
  if (authMode() === "api") return apiOrThrow(scope, "/api/ops/network", { ignoreViewAs: true });

  const open = db.incidents.filter(isOpen);
  return warehouses.map((w) => {
    const xs = open.filter((i) => i.warehouse_id === w.id);
    return {
      warehouse: { id: w.id, name: w.name, market: w.market },
      open_incidents: xs.length,
      money_at_risk_usd: money(xs),
      low_cover_skus: inventory.filter((r) => r.warehouse_id === w.id && r.days_of_cover < LOW_COVER_DAYS).length,
      distributors: distributors
        .filter((d) => d.warehouse_id === w.id)
        .map((d) => {
          const ds = xs.filter((i) => i.distributor_id === d.id);
          return {
            id: d.id,
            name: d.name,
            segment: d.segment,
            open_incidents: ds.length,
            money_at_risk_usd: money(ds),
            low_cover_skus: stock.filter((s) => s.distributor_id === d.id && s.days_of_cover < LOW_COVER_DAYS).length,
          };
        }),
    };
  });
}
