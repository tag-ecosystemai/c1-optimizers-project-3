import type {
  Cascade,
  Decision,
  Evidence,
  IncidentStatus,
  RecommendedOption,
  Severity,
  ShapFactor,
  ShippingMode,
} from "@/types/api";
import { riskBand } from "@/components/runout/risk";
import { addDays, date, daysBetween, percent, usd } from "@/lib/format";
import { AS_OF_DATE, distributorById, warehouseById, warehouses } from "./network";
import { productById } from "./products";

/** Everything one incident knows, before role shaping (see lib/data). */
export interface MockIncident {
  incident_id: number;
  order_id: number;
  distributor_id: number;
  warehouse_id: number;
  product_id: number;
  severity: Severity;
  status: IncidentStatus;
  created_at: string;
  shipping_mode: ShippingMode;
  order_date: string;
  shipping_date: string;
  original_eta: string;
  quantity: number;
  order_item_total: number;
  cascade: Required<Cascade>;
  probable_cause: string | null;
  cause_confidence: number | null;
  evidence: Evidence[];
  shap: ShapFactor[];
  recommended_options: RecommendedOption[];
  briefing_ops: string | null;
  briefing_warehouse: string | null;
  briefing_distributor: string | null;
  decisions: Decision[];
}

// [id, order, distributor, product, mode, shipped, original ETA, delay days, days of cover, units short, $ at risk, status, cause, confidence]
type Seed = [number, number, number, number, ShippingMode, string, string, number, number, number, number, IncidentStatus, string | null, number | null];

const seeds: Seed[] = [
  // HIGH
  [812, 55123, 7, 41, "Second Class", "2017-03-01", "2017-03-11", 7.0, 12, 240, 1181, "open", "Port strike at Santos", 0.72],
  [801, 55101, 5, 72, "Standard Class", "2017-02-22", "2017-03-04", 6.2, 5, 48, 864, "approved", "Winter storm closing the I-80 freight corridor", 0.81],
  [805, 55105, 13, 81, "First Class", "2017-02-26", "2017-03-05", 4.8, 6, 14, 560, "escalated", "Cyclone warning at the Port of Brisbane", 0.64],
  [809, 55109, 3, 43, "Second Class", "2017-02-27", "2017-03-09", 3.6, 10, 22, 618, "open", null, null],
  // MEDIUM
  [802, 55102, 8, 82, "Standard Class", "2017-02-20", "2017-03-04", 3.1, 4, 60, 312, "resolved", "Customs inspection backlog at Santos", 0.58],
  [803, 55103, 10, 61, "Standard Class", "2017-02-21", "2017-03-05", 6.4, 7, 35, 455, "open", "Fuel shortage slowing trucking out of Lagos", 0.69],
  [806, 55106, 1, 51, "Second Class", "2017-02-25", "2017-03-07", 2.4, 7, 12, 186, "dismissed", "Rail strike in the Hamburg port region", 0.55],
  [807, 55107, 6, 113, "First Class", "2017-02-27", "2017-03-04", 3.9, 5, 40, 248, "open", null, null],
  [810, 55110, 14, 93, "Standard Class", "2017-02-23", "2017-03-07", 4.5, 9, 6, 390, "approved", "Container shortage at the Port of Melbourne", 0.61],
  [814, 55114, 11, 72, "Second Class", "2017-02-26", "2017-03-08", 5.0, 10, 9, 140, "escalated", "Customs clearance delays at Apapa port", 0.66],
  [816, 55116, 12, 44, "Standard Class", "2017-02-28", "2017-03-10", 4.2, 12, 3, 210, "open", "Fuel shortage slowing trucking out of Lagos", 0.7],
  // LOW
  [804, 55104, 2, 83, "Standard Class", "2017-02-22", "2017-03-06", 2.1, 6, 18, 42, "resolved", "Snow delaying road freight through Bavaria", 0.62],
  [808, 55108, 15, 112, "Second Class", "2017-02-24", "2017-03-06", 1.8, 6, 10, 64, "open", "Carrier capacity shortfall on Sydney routes", 0.52],
  [811, 55111, 12, 123, "Standard Class", "2017-02-25", "2017-03-09", 3.3, 9, 15, 71, "approved", "Fuel shortage slowing trucking out of Lagos", 0.67],
  [813, 55113, 4, 74, "Standard Class", "2017-02-26", "2017-03-10", 2.6, 11, 12, 88, "open", null, null],
  [815, 55115, 13, 102, "First Class", "2017-02-27", "2017-03-05", 1.6, 5, 20, 55, "dismissed", "Cyclone warning at the Port of Brisbane", 0.48],
  [817, 55117, 2, 53, "Second Class", "2017-02-26", "2017-03-08", 2.2, 8, 9, 96, "open", "Snow delaying road freight through Bavaria", 0.57],
  [818, 55118, 1, 131, "Standard Class", "2017-02-21", "2017-03-05", 1.4, 4, 7, 31, "resolved", "Rail strike in the Hamburg port region", 0.59],
];

const OPS = "Jane Doe";
const OPS_2 = "Marcus Lee";
const whManager = (warehouseId: number) => `${warehouseById(warehouseId)!.market} warehouse manager`;

// [incident, action, by ("wh" = that warehouse's manager), option, note]
const decisionSeeds: [number, Decision["action"], string, string | null, string | null][] = [
  [801, "acknowledged", "wh", null, null],
  [801, "approved", OPS, "opt_1", "Storm clears Thursday; expedite the rest."],
  [802, "acknowledged", "wh", null, null],
  [802, "approved", OPS_2, "opt_2", null],
  [803, "acknowledged", "wh", null, null],
  [804, "acknowledged", "wh", null, null],
  [804, "approved", OPS, "opt_1", null],
  [805, "escalated", OPS, null, "Cost is above my limit; needs the regional director."],
  [805, "acknowledged", "wh", null, null],
  [806, "acknowledged", "wh", null, null],
  [806, "dismissed", OPS_2, null, "Distributor holds safety stock at a second site."],
  [808, "acknowledged", "wh", null, null],
  [809, "acknowledged", "wh", null, null],
  [810, "escalated", OPS, null, "Check whether Melbourne can release containers first."],
  [810, "approved", OPS_2, "opt_1", "Port confirmed no relief this week."],
  [811, "acknowledged", "wh", null, null],
  [811, "approved", OPS, "opt_3", null],
  [813, "acknowledged", "wh", null, null],
  [814, "acknowledged", "wh", null, null],
  [814, "escalated", OPS_2, null, "Customs broker needs sign-off from finance."],
  [815, "acknowledged", "wh", null, null],
  [815, "dismissed", OPS, null, "Low value; the distributor reorders weekly anyway."],
  [816, "acknowledged", "wh", null, null],
  [818, "acknowledged", "wh", null, null],
  [818, "approved", OPS_2, "opt_4", "Notify only; the gap is one day."],
];

export const transitDays: Record<ShippingMode, number> = { "Same Day": 3, "First Class": 7, "Second Class": 10, "Standard Class": 12 };
const faster: Record<ShippingMode, ShippingMode> = {
  "Standard Class": "Second Class",
  "Second Class": "First Class",
  "First Class": "Same Day",
  "Same Day": "Same Day",
};

function options(id: number, mode: ShippingMode, warehouseId: number, cover: number, short: number, money: number): RecommendedOption[] {
  if (id === 812) {
    return [
      { option_id: "opt_1", type: "expedite", title: "Upgrade to First Class shipping", description: "Cuts transit by about 5 days; covers 190 of the 240 units short.", cost_usd: 340, eta_days: 13, units_covered: 190, recommended: true },
      { option_id: "opt_2", type: "transfer", title: "Transfer from the USCA warehouse", description: "Ships all 240 units from USCA stock; arrives before the stockout but costs more.", cost_usd: 520, eta_days: 11, units_covered: 240, recommended: false },
      { option_id: "opt_3", type: "split_shipment", title: "Split the shipment", description: "Sends 96 units ahead by air; the rest stays on the delayed sailing.", cost_usd: 180, eta_days: 12, units_covered: 96, recommended: false },
      { option_id: "opt_4", type: "notify_only", title: "Notify Brazil Consumer only", description: "No cost; the distributor plans around a five-day gap.", cost_usd: 0, eta_days: 17, units_covered: 0, recommended: false },
    ];
  }
  const alt = warehouses[warehouseId % warehouses.length];
  return [
    { option_id: "opt_1", type: "expedite", title: `Upgrade to ${faster[mode]} shipping`, description: `Cuts transit by a few days; covers about 80% of the ${short} units short.`, cost_usd: Math.round(money * 0.3), eta_days: cover + 1, units_covered: Math.round(short * 0.8), recommended: true },
    { option_id: "opt_2", type: "transfer", title: `Transfer from the ${alt.market} warehouse`, description: `Ships all ${short} units from ${alt.market} stock.`, cost_usd: Math.round(money * 0.45), eta_days: cover - 1, units_covered: short, recommended: false },
    { option_id: "opt_3", type: "split_shipment", title: "Split the shipment", description: "Sends part of the order ahead by air.", cost_usd: Math.round(money * 0.15), eta_days: cover, units_covered: Math.round(short * 0.4), recommended: false },
    { option_id: "opt_4", type: "notify_only", title: "Notify the distributor only", description: "No cost; the distributor plans around the gap.", cost_usd: 0, eta_days: cover + 4, units_covered: 0, recommended: false },
  ];
}

function evidence(id: number, cause: string, mode: ShippingMode, market: string, shipped: string): Evidence[] {
  if (id === 812) {
    return [
      { type: "news", source: "GDELT", summary: "Dock workers at the Port of Santos began an open-ended strike; container handling is down by about 60%.", url: "https://www.gdeltproject.org/", timestamp: "2017-02-27T14:20:00Z" },
      { type: "weather", source: "Open-Meteo", summary: "Heavy rain forecast for São Paulo state through Mar 5, slowing road haulage from the port.", url: "https://open-meteo.com/", timestamp: "2017-02-28T09:00:00Z" },
      { type: "data", source: "RunOut orders", summary: "Second Class orders on the LATAM route ran 5.8 days late on average over the last 30 days (41% late).", url: null, timestamp: "2017-03-01T05:30:00Z" },
    ];
  }
  return [
    { type: "news", source: "GDELT", summary: `${cause}, reported by regional press.`, url: "https://www.gdeltproject.org/", timestamp: `${shipped}T10:00:00Z` },
    { type: "data", source: "RunOut orders", summary: `${mode} orders on the ${market} route have run late more often over the last 30 days.`, url: null, timestamp: `${AS_OF_DATE}T05:30:00Z` },
  ];
}

function shap(id: number, mode: ShippingMode, market: string, delay: number): ShapFactor[] {
  const weights: [string, string, number][] =
    id === 812
      ? [
          ["late_rate_30d", "Carrier late rate, last 30 days", 2.1],
          ["shipping_mode_encoded", `${mode} shipping`, 1.9],
          ["order_region_encoded", `${market} route`, 1.6],
          ["days_for_shipment_scheduled", "Scheduled transit time", 1.2],
          ["order_month", "Time of year", 0.6],
          ["order_item_quantity", "Order size", -0.4],
        ]
      : [
          ["late_rate_30d", "Carrier late rate, last 30 days", 0.32 * delay],
          ["shipping_mode_encoded", `${mode} shipping`, 0.28 * delay],
          ["order_region_encoded", `${market} route`, 0.24 * delay],
          ["days_for_shipment_scheduled", "Scheduled transit time", 0.16 * delay],
          ["order_month", "Time of year", 0.1 * delay],
          ["order_item_quantity", "Order size", -0.1 * delay],
        ];
  return weights.map(([feature, label, c]) => ({ feature, label, contribution: Math.round(c * 10) / 10 }));
}

function build(seed: Seed, decisionId: { next: number }): MockIncident {
  const [id, orderId, distributorId, productId, mode, shipped, originalEta, delay, cover, short, money, status, cause, confidence] = seed;
  const d = distributorById(distributorId)!;
  const product = productById(productId)!;
  const arrival = addDays(originalEta, Math.round(delay));
  const stockout = addDays(AS_OF_DATE, cover);
  const gap = daysBetween(stockout, arrival);
  const quantity = id === 812 ? 300 : Math.round(short * 1.25);
  const opts = cause ? options(id, mode, d.warehouse_id, cover, short, money) : [];
  const rec = opts.find((o) => o.recommended);
  const createdDay = shipped < AS_OF_DATE ? addDays(shipped, 1) : AS_OF_DATE;

  const decisions = decisionSeeds
    .filter(([incident]) => incident === id)
    .map<Decision>(([, action, by, option, note], i) => ({
      decision_id: decisionId.next++,
      action,
      by: by === "wh" ? whManager(d.warehouse_id) : by,
      note,
      selected_option_id: option,
      decided_at: `${createdDay}T${String(8 + i * 3).padStart(2, "0")}:15:00Z`,
    }));

  const approved = status === "approved" || status === "resolved";
  return {
    incident_id: id,
    order_id: orderId,
    distributor_id: distributorId,
    warehouse_id: d.warehouse_id,
    product_id: productId,
    severity: riskBand(money),
    status,
    created_at: `${createdDay}T06:00:00Z`,
    shipping_mode: mode,
    order_date: addDays(shipped, -2),
    shipping_date: shipped,
    original_eta: originalEta,
    quantity,
    order_item_total: Math.round(quantity * product.price * 100) / 100,
    cascade: {
      days_of_cover: cover,
      stockout_date: stockout,
      projected_arrival: arrival,
      predicted_delay_days: delay,
      delay_risk_score: id === 812 ? 0.83 : Math.round((0.55 + Math.min(delay / 20, 0.4)) * 100) / 100,
      units_short: short,
      money_at_risk_usd: money,
    },
    probable_cause: cause,
    cause_confidence: confidence,
    evidence: cause ? evidence(id, cause, mode, d.market, shipped) : [],
    shap: shap(id, mode, d.market, delay),
    recommended_options: opts,
    briefing_ops:
      cause && rec
        ? `Order #${orderId} to ${d.name} (${d.market}) is predicted ${delay.toFixed(1)} days late, arriving ${date(arrival)} against a stockout on ${date(stockout)}: ${short} units short and ${usd(money)} at risk. Most likely cause: ${cause.toLowerCase()} (${percent(confidence!)} confidence). Recommended: ${rec.title.toLowerCase()} for ${usd(rec.cost_usd!)}, covering ${rec.units_covered} of the ${short} units.`
        : null,
    briefing_warehouse: `${product.name} for ${d.name} runs out on ${date(stockout)}; order #${orderId} now lands ${date(arrival)}, ${gap} days later, leaving ${short} units short.`,
    briefing_distributor:
      `Order #${orderId} is running about ${Math.round(delay)} days late and should now arrive on ${date(arrival)}. ` +
      `Your ${product.category.toLowerCase()} runs out on ${date(stockout)}, so you could be about ${short} units short for ${gap} days.` +
      (approved ? " Your supplier has approved faster shipping, so this date may improve." : ""),
    decisions,
  };
}

/** Fresh copy of the 18 incidents (the data layer keeps a mutable copy in memory). */
export function buildIncidents(): MockIncident[] {
  const counter = { next: 1 };
  return seeds.map((s) => build(s, counter));
}
