import type { MyOrder, MyOrderDetail, MyOrderListParams, MyOverview, MyStockRow, Page, TimelineEvent } from "@/types/api";
import { db } from "@/mocks/db";
import { stock } from "@/mocks/inventory";
import { AS_OF_DATE } from "@/mocks/network";
import { orders, type MockOrder } from "@/mocks/orders";
import { productById } from "@/mocks/products";
import { date, days } from "@/lib/format";
import { api, apiOrThrow, authMode, contains, getScope, paginate } from "./core";
import { toListItem } from "./incidents";

// Distributor endpoints (spec §7.4). Scope is the session's distributor; no dollar fields ever leave here.

const product = (id: number) => {
  const p = productById(id)!;
  return { id: p.id, name: p.name, category: p.category };
};

function toMyOrder(o: MockOrder): MyOrder {
  const incident = db.incidents.find((i) => i.order_id === o.order_id);
  return {
    order_id: o.order_id,
    product: product(o.product_id),
    quantity: o.quantity,
    order_date: o.order_date,
    shipping_mode: o.shipping_mode,
    status: o.status,
    original_eta: o.original_eta,
    predicted_eta: o.predicted_eta,
    predicted_delay_days: o.predicted_delay_days,
    risk: incident?.severity ?? "NONE",
    incident_id: incident?.incident_id ?? null,
  };
}

const myStock = (distributorId: number | null) => stock.filter((s) => s.distributor_id === distributorId);

/** GET /api/my/overview. */
export async function getMyOverview(): Promise<MyOverview> {
  const scope = await getScope("distributor");
  if (authMode() === "api") return apiOrThrow(scope, "/api/my/overview");

  const mine = orders.filter((o) => o.distributor_id === scope.distributorId);
  const atRisk = myStock(scope.distributorId).filter((s) => s.severity !== "NONE");
  const activity = mine.map((o) =>
    o.status === "delivered"
      ? { date: o.predicted_eta, order_id: o.order_id, text: `Order #${o.order_id} was delivered.` }
      : o.status === "in_transit"
        ? { date: o.shipping_date, order_id: o.order_id, text: `Order #${o.order_id} shipped by ${o.shipping_mode}.` }
        : { date: o.order_date, order_id: o.order_id, text: `Order #${o.order_id} was placed.` },
  );
  return {
    kpis: {
      orders_in_transit: mine.filter((o) => o.status === "in_transit").length,
      orders_predicted_late: mine.filter((o) => o.status !== "delivered" && o.predicted_delay_days > 0).length,
      products_at_risk: atRisk.length,
      nearest_stockout_date: atRisk.map((s) => s.stockout_date).sort()[0] ?? null,
    },
    needs_attention: db.incidents
      .filter((i) => i.distributor_id === scope.distributorId && i.status !== "resolved" && i.status !== "dismissed")
      .sort((a, b) => a.cascade.stockout_date.localeCompare(b.cascade.stockout_date))
      .slice(0, 5)
      .map((i) => toListItem(i, "distributor")),
    recent_activity: activity
      .filter((a) => a.date <= AS_OF_DATE)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6),
  };
}

/** GET /api/my/orders, newest first. */
export async function listMyOrders(params: MyOrderListParams = {}): Promise<Page<MyOrder>> {
  const scope = await getScope("distributor");
  if (authMode() === "api") return apiOrThrow(scope, "/api/my/orders", { query: { ...params } });
  const rows = orders
    .filter((o) => o.distributor_id === scope.distributorId)
    .map(toMyOrder)
    .filter(
      (o) =>
        (!params.status || o.status === params.status) &&
        (!params.risk || o.risk === params.risk) &&
        (!params.shipping_mode || o.shipping_mode === params.shipping_mode) &&
        (!params.from || o.order_date >= params.from) &&
        (!params.to || o.order_date <= params.to) &&
        contains([o.order_id, o.product.name], params.q),
    );
  return paginate(rows, params);
}

/** GET /api/my/orders/{id}. null if it isn't this distributor's order. */
export async function getMyOrder(orderId: number): Promise<MyOrderDetail | null> {
  const scope = await getScope("distributor");
  if (authMode() === "api") return api<MyOrderDetail>(scope, `/api/my/orders/${orderId}`);

  const o = orders.find((x) => x.order_id === orderId && x.distributor_id === scope.distributorId);
  if (!o) return null;
  const base = toMyOrder(o);
  const incident = db.incidents.find((i) => i.order_id === o.order_id);
  const s = myStock(scope.distributorId).find((x) => x.product_id === o.product_id);
  const late = o.predicted_delay_days > 0;
  const delivered = o.status === "delivered";

  const timeline: TimelineEvent[] = [
    { key: "ordered", label: "Ordered", date: o.order_date, state: "done" },
    { key: "shipped", label: "Shipped", date: o.shipping_date, state: o.shipping_date <= AS_OF_DATE ? "done" : "upcoming" },
    { key: "original_eta", label: late ? "Original ETA" : "ETA", date: o.original_eta, state: delivered ? "done" : "upcoming" },
  ];
  if (late) timeline.push({ key: "predicted_eta", label: "Predicted arrival", date: o.predicted_eta, state: delivered ? "done" : "warning" });
  if (incident) timeline.push({ key: "stockout", label: "Your stock runs out", date: incident.cascade.stockout_date, state: "warning" });
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  const { days_of_cover, stockout_date, projected_arrival, predicted_delay_days, units_short } = incident?.cascade ?? {
    days_of_cover: s?.days_of_cover ?? 0,
    stockout_date: s?.stockout_date ?? o.predicted_eta,
    projected_arrival: o.predicted_eta,
    predicted_delay_days: o.predicted_delay_days,
    units_short: 0,
  };

  const briefing =
    incident?.briefing_distributor ??
    (delivered
      ? `Order #${o.order_id} was delivered on ${date(o.predicted_eta)}.`
      : late
        ? `Order #${o.order_id} is running about ${days(o.predicted_delay_days)} late and should now arrive on ${date(o.predicted_eta)}. Your stock of this product should last until then.`
        : `Order #${o.order_id} is on track to arrive on ${date(o.original_eta)}.`);

  return {
    ...base,
    shipping_date: o.shipping_date,
    timeline,
    cover: s || incident ? { days_of_cover, stockout_date, projected_arrival, predicted_delay_days, units_short } : null,
    briefing_text: briefing,
  };
}

/** GET /api/my/stock, lowest cover first. */
export async function getMyStock(): Promise<MyStockRow[]> {
  const scope = await getScope("distributor");
  if (authMode() === "api") return apiOrThrow(scope, "/api/my/stock");
  return myStock(scope.distributorId)
    .map((s) => ({
      product: product(s.product_id),
      weekly_usage_forecast: s.weekly_usage_forecast,
      days_of_cover: s.days_of_cover,
      stockout_date: s.stockout_date,
      severity: s.severity,
      weekly_history: s.weekly_history,
    }))
    .sort((a, b) => a.days_of_cover - b.days_of_cover);
}
