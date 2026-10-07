import type { Market, Segment } from "@/types/api";

// The demo world, same as the landing page. "Today" for every countdown.
export const AS_OF_DATE = "2017-03-01";

export interface MockWarehouse {
  id: number;
  name: string;
  market: Market;
  country: string;
  /** Short key used in demo emails, e.g. latam.warehouse@runout.demo. */
  slug: string;
}

export interface MockDistributor {
  id: number;
  name: string;
  market: Market;
  segment: Segment;
  country: string;
  warehouse_id: number;
}

export const warehouses: MockWarehouse[] = [
  { id: 1, name: "Europe Logistics Center", market: "Europe", country: "Germany", slug: "europe" },
  { id: 2, name: "USCA Logistics Center", market: "USCA", country: "US", slug: "usca" },
  { id: 3, name: "LATAM Logistics Center", market: "LATAM", country: "Brazil", slug: "latam" },
  { id: 4, name: "Africa Logistics Center", market: "Africa", country: "Nigeria", slug: "africa" },
  { id: 5, name: "Pacific Asia Logistics Center", market: "Pacific Asia", country: "Australia", slug: "apac" },
];

export const segments: Segment[] = ["Consumer", "Corporate", "Home Office"];

// 3 per warehouse; id = (warehouse - 1) * 3 + segment index + 1, so Brazil Consumer is 7.
export const distributors: MockDistributor[] = warehouses.flatMap((w) =>
  segments.map((segment, i) => ({
    id: (w.id - 1) * 3 + i + 1,
    name: `${w.country} ${segment}`,
    market: w.market,
    segment,
    country: w.country,
    warehouse_id: w.id,
  })),
);

export const warehouseById = (id: number) => warehouses.find((w) => w.id === id);
export const distributorById = (id: number) => distributors.find((d) => d.id === id);
