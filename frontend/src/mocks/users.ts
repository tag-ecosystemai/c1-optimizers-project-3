import type { Me } from "@/types/api";
import { distributors, warehouses } from "./network";

/** Shared password for every demo account (mock mode only). */
export const DEMO_PASSWORD = "runout-demo";

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export const users: Me[] = [
  { user_id: "u-ops", email: "ops@runout.demo", role: "ops", display_name: "Jane Doe", distributor_id: null, warehouse_id: null },
  { user_id: "u-data", email: "data@runout.demo", role: "data", display_name: "Tunde Bakare", distributor_id: null, warehouse_id: null },
  ...warehouses.map<Me>((w) => ({
    user_id: `u-wh-${w.id}`,
    email: `${w.slug}.warehouse@runout.demo`,
    role: "warehouse",
    display_name: `${w.market} warehouse manager`,
    distributor_id: null,
    warehouse_id: w.id,
  })),
  ...distributors.map<Me>((d) => ({
    user_id: `u-dist-${d.id}`,
    email: `${slug(d.country)}.${slug(d.segment)}@runout.demo`,
    role: "distributor",
    display_name: d.name,
    distributor_id: d.id,
    warehouse_id: d.warehouse_id,
  })),
];

export const userByEmail = (email: string) => users.find((u) => u.email === email.trim().toLowerCase());
export const userById = (id: string) => users.find((u) => u.user_id === id);
