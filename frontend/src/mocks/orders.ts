import type { OrderStatus, ShippingMode } from "@/types/api";
import { addDays } from "@/lib/format";
import { buildIncidents, transitDays } from "./incidents";
import { AS_OF_DATE, distributors } from "./network";
import { products, productById } from "./products";

export interface MockOrder {
  order_id: number;
  distributor_id: number;
  warehouse_id: number;
  product_id: number;
  quantity: number;
  order_date: string;
  shipping_date: string;
  shipping_mode: ShippingMode;
  original_eta: string;
  predicted_delay_days: number;
  predicted_eta: string;
  delay_risk_score: number;
  status: OrderStatus;
  /** Internal $ fields: never returned to distributors. */
  order_item_total: number;
  benefit_per_order: number;
}

/** Small seeded PRNG so the fixtures are the same on every run. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const modes: ShippingMode[] = ["Standard Class", "Standard Class", "Standard Class", "Second Class", "Second Class", "First Class", "Same Day"];

function statusFor(shipped: string, eta: string): OrderStatus {
  if (shipped > AS_OF_DATE) return "processing";
  return eta < AS_OF_DATE ? "delivered" : "in_transit";
}

function make(o: Omit<MockOrder, "warehouse_id" | "original_eta" | "predicted_eta" | "status" | "order_item_total" | "benefit_per_order"> & { original_eta?: string }): MockOrder {
  const original = o.original_eta ?? addDays(o.shipping_date, transitDays[o.shipping_mode]);
  const predicted = addDays(original, Math.round(o.predicted_delay_days));
  const total = Math.round(o.quantity * productById(o.product_id)!.price * 100) / 100;
  return {
    ...o,
    warehouse_id: distributors.find((d) => d.id === o.distributor_id)!.warehouse_id,
    original_eta: original,
    predicted_eta: predicted,
    status: statusFor(o.shipping_date, predicted),
    order_item_total: total,
    benefit_per_order: Math.round(total * 0.12 * 100) / 100,
  };
}

function generate(): MockOrder[] {
  const rand = seeded(55123);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  // Each distributor orders from its own handful of products.
  const catalogue = new Map(distributors.map((d) => [d.id, Array.from({ length: 6 }, () => pick(products).id)]));
  const out: MockOrder[] = [];
  for (let i = 0; i < 200; i++) {
    const d = distributors[i % distributors.length];
    const orderDate = addDays("2017-01-10", Math.floor(rand() * 50)); // Jan 10 – Feb 28
    const mode = pick(modes);
    const risk = Math.round(rand() * 100) / 100;
    const delay = risk > 0.65 ? Math.round((2 + rand() * 6) * 10) / 10 : risk > 0.4 ? Math.round(rand() * 20) / 10 : 0;
    out.push(
      make({
        order_id: 54900 + i,
        distributor_id: d.id,
        product_id: pick(catalogue.get(d.id)!),
        quantity: 20 + Math.floor(rand() * 180),
        order_date: orderDate,
        shipping_date: addDays(orderDate, 1 + Math.floor(rand() * 3)),
        shipping_mode: mode,
        predicted_delay_days: delay,
        delay_risk_score: risk,
      }),
    );
  }
  return out;
}

const incidentOrders = buildIncidents().map((i) =>
  make({
    order_id: i.order_id,
    distributor_id: i.distributor_id,
    product_id: i.product_id,
    quantity: i.quantity,
    order_date: i.order_date,
    shipping_date: i.shipping_date,
    shipping_mode: i.shipping_mode,
    original_eta: i.original_eta,
    predicted_delay_days: i.cascade.predicted_delay_days,
    delay_risk_score: i.cascade.delay_risk_score,
  }),
);

/** ~200 generated orders plus the 18 incident orders (#55123 included), newest first. */
export const orders: MockOrder[] = [...generate(), ...incidentOrders].sort((a, b) => b.order_date.localeCompare(a.order_date) || b.order_id - a.order_id);

export const orderById = (id: number) => orders.find((o) => o.order_id === id);
