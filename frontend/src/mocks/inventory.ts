import type { Severity } from "@/types/api";
import { addDays } from "@/lib/format";
import { buildIncidents } from "./incidents";
import { AS_OF_DATE, distributors, warehouses } from "./network";
import { orders, seeded } from "./orders";
import { products } from "./products";

/** "SKUs under N days of cover" on the warehouse screens. */
export const LOW_COVER_DAYS = 14;

export interface MockInventory {
  warehouse_id: number;
  product_id: number;
  stock_on_hand: number;
  weekly_usage: number;
  days_of_cover: number;
  stockout_date: string;
  severity: Severity;
}

export interface MockStock {
  distributor_id: number;
  product_id: number;
  weekly_usage_forecast: number;
  days_of_cover: number;
  stockout_date: string;
  severity: Severity;
  weekly_history: number[];
}

const rank: Record<Severity, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
const coverBand = (days: number): Severity => (days < 10 ? "MEDIUM" : days < LOW_COVER_DAYS ? "LOW" : "NONE");
const live = buildIncidents().filter((i) => i.status === "open" || i.status === "escalated" || i.status === "approved");

// LATAM matches the landing page: cardio (Brazil Consumer, #812) runs out Mar 13, water sports has 9 days left.
const coverOverrides: Record<string, number> = { "3:41": 12, "3:82": 9 };

export const inventory: MockInventory[] = warehouses.flatMap((w) => {
  const rand = seeded(w.id * 1000);
  return products.map((p) => {
    const weekly = 20 + Math.floor(rand() * 180);
    const incidents = live.filter((i) => i.warehouse_id === w.id && i.product_id === p.id);
    const cover = coverOverrides[`${w.id}:${p.id}`] ?? (incidents.length ? Math.min(...incidents.map((i) => i.cascade.days_of_cover)) : 16 + Math.floor(rand() * 45));
    const severity = incidents.reduce<Severity>((s, i) => (rank[i.severity] > rank[s] ? i.severity : s), coverBand(cover));
    return {
      warehouse_id: w.id,
      product_id: p.id,
      stock_on_hand: Math.round((weekly / 7) * cover),
      weekly_usage: weekly,
      days_of_cover: cover,
      stockout_date: addDays(AS_OF_DATE, cover),
      severity,
    };
  });
});

/** Per distributor, each product it orders: M2 weekly usage forecast and days of cover. */
export const stock: MockStock[] = distributors.flatMap((d) => {
  const rand = seeded(d.id * 7919);
  const productIds = [...new Set(orders.filter((o) => o.distributor_id === d.id).map((o) => o.product_id))];
  return productIds.map((pid) => {
    const weekly = 5 + Math.floor(rand() * 55);
    const incident = live.find((i) => i.distributor_id === d.id && i.product_id === pid);
    const cover = incident ? incident.cascade.days_of_cover : 15 + Math.floor(rand() * 40);
    return {
      distributor_id: d.id,
      product_id: pid,
      weekly_usage_forecast: weekly,
      days_of_cover: cover,
      stockout_date: addDays(AS_OF_DATE, cover),
      severity: incident ? incident.severity : coverBand(cover),
      weekly_history: Array.from({ length: 8 }, () => Math.round(weekly * (0.7 + rand() * 0.6))),
    };
  });
});
