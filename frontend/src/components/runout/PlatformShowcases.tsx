// Mock-ups for the Platform tabs in IntelligentSystem, modelled on the app screens in docs/FRONTEND_SPEC.md.
// All figures are an illustrative example; severity follows the spec bands (risk.ts).
// One distributor per market and segment, as in the spec: Germany (Europe), US (USCA), Brazil (LATAM),
// Nigeria (Africa), Australia (Pacific Asia) × Consumer / Corporate / Home Office.
import { RiskBadge } from "./RiskBadge";
import { RunwayBar } from "./RunwayBar";
import { riskBand, usd } from "./risk";
import { WindowDots } from "../ui/WindowDots";

// Ids must match STEPS in Pipeline.tsx.
export const showcases = [
  {
    id: "predict-late-orders",
    title: "Every order gets a delay forecast.",
    line: "A model trained on years of real order history predicts how many days late each order will land, and how sure it is.",
    crumb: "Orders",
    Mockup: PredictMockup,
  },
  {
    id: "check-distributor-stock",
    title: "Late only matters if someone runs out.",
    line: "RunOut checks each predicted arrival against the distributor's days of cover, so you only see the delays that cause a stockout.",
    crumb: "Distributor cover",
    Mockup: CoverMockup,
  },
  {
    id: "find-the-cause",
    title: "Every alert explains itself.",
    line: "An agent reads the news, the weather and your own shipping history, then gives the probable cause, its confidence and the evidence behind it.",
    crumb: "Incident #812",
    Mockup: CauseMockup,
  },
  {
    id: "price-the-damage",
    title: "The costliest problem is always on top.",
    line: "Units short and dollars at risk for every incident, ranked across all five markets.",
    crumb: "Incidents",
    Mockup: QueueMockup,
  },
  {
    id: "approve-the-fix",
    title: "You decide. RunOut never acts alone.",
    line: "Each incident comes with costed options: faster shipping, a transfer from another warehouse or a split shipment. Ops approves, dismisses or escalates, and every decision is logged.",
    crumb: "Incident #812",
    Mockup: FixMockup,
  },
];

/* ---------- Mock-up chrome ---------- */

/** The mock-up stage: designed at 900×508, scaled down below lg (40% on phones so 900px fits in 360px). */
export function ShowcaseFrame({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return (
    <div className="absolute top-1/2 left-1/2 h-[508px] w-[900px] -translate-x-1/2 -translate-y-1/2 scale-[0.4] sm:scale-50 lg:scale-100">
      <Window crumb={crumb}>{children}</Window>
    </div>
  );
}

function Window({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-line-faint bg-white font-sans text-fg shadow-[0_1px_2px_rgb(16_24_40/0.04),0_12px_32px_-12px_rgb(16_24_40/0.12)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-line-faint border-b px-5 text-[13px]">
        <span className="flex items-center text-muted">
          <WindowDots className="mr-4 gap-1.5" />
          Watchtower <span className="mx-1.5 text-line">/</span>
          <span className="font-medium text-fg">{crumb}</span>
        </span>
        <span className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full bg-risk-low" />
          Live, as of Mar 1
        </span>
      </div>
      <div className="min-h-0 flex-1 p-5">{children}</div>
    </div>
  );
}

const tones = {
  red: "bg-red-50 text-risk-high ring-red-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-green-50 text-risk-low ring-green-200",
  grey: "bg-surface text-muted ring-line-faint",
} as const;

function Tag({ tone, children }: { tone: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-flex h-6 items-center rounded-md px-2 font-medium text-[12px] ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 font-medium text-[13px] text-muted">{children}</p>;
}

function Tabs({ items }: { items: string[] }) {
  return (
    <div className="mb-4 flex gap-2 text-[13px]">
      {items.map((t, i) => (
        <span key={t} className={`rounded-md px-2.5 py-1 ${i === 0 ? "bg-surface font-medium text-fg" : "text-muted"}`}>{t}</span>
      ))}
    </div>
  );
}

/* ---------- 1. Predict late orders ---------- */

const orders = [
  { id: 55123, distributor: "Brazil Consumer", market: "LATAM", mode: "Second Class", delay: 7.0, risk: 0.83 },
  { id: 55187, distributor: "Germany Corporate", market: "Europe", mode: "Standard Class", delay: 2.9, risk: 0.71 },
  { id: 55201, distributor: "Nigeria Home Office", market: "Africa", mode: "Standard Class", delay: 2.1, risk: 0.64 },
  { id: 55234, distributor: "Australia Consumer", market: "Pacific Asia", mode: "Second Class", delay: 1.3, risk: 0.48 },
  { id: 55250, distributor: "US Corporate", market: "USCA", mode: "First Class", delay: 0.2, risk: 0.12 },
  { id: 55262, distributor: "Brazil Corporate", market: "LATAM", mode: "Same Day", delay: 0, risk: 0.04 },
];

function PredictMockup() {
  return (
    <div className="flex h-full flex-col">
      <Tabs items={["All orders 1,284", "Predicted late 212", "On time 1,072"]} />
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-line-faint border-b">
            <th className="pb-2.5 font-medium">Order</th>
            <th className="pb-2.5 font-medium">Distributor</th>
            <th className="pb-2.5 font-medium">Market</th>
            <th className="pb-2.5 font-medium">Shipping</th>
            <th className="pb-2.5 text-right font-medium">Predicted delay</th>
            <th className="w-[150px] pb-2.5 pl-6 font-medium">Late risk</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-line-faint border-b last:border-b-0">
              <td className="py-3.5 font-mono">#{o.id}</td>
              <td className="py-3.5 font-medium">{o.distributor}</td>
              <td className="py-3.5 text-muted">{o.market}</td>
              <td className="py-3.5">{o.mode}</td>
              <td className={`py-3.5 text-right font-mono ${o.delay >= 2 ? "text-risk-high" : ""}`}>{o.delay ? `+${o.delay.toFixed(1)} days` : "On time"}</td>
              <td className="py-3.5 pl-6">
                <span className="flex items-center gap-2.5">
                  <span className="h-1.5 flex-1 rounded-full bg-line-faint">
                    <span className={`block h-full rounded-full ${o.risk >= 0.6 ? "bg-risk-high" : o.risk >= 0.3 ? "bg-risk-med" : "bg-fg/30"}`} style={{ width: `${o.risk * 100}%` }} />
                  </span>
                  <span className="w-9 text-right font-mono text-[12px]">{o.risk.toFixed(2)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 2. Check distributor stock ---------- */

// Days from Mar 1 on a 21-day window: stock runs out on day `cover`, the order lands on day `arrival`.
const cover = [
  { distributor: "Brazil Consumer", product: "Cardio equipment", cover: 12, arrival: 17, perDay: 48 },
  { distributor: "Germany Corporate", product: "Men's footwear", cover: 9, arrival: 11, perDay: 60 },
  { distributor: "Nigeria Home Office", product: "Camping & hiking", cover: 6, arrival: 7, perDay: 14 },
  { distributor: "Australia Consumer", product: "Water sports", cover: 15, arrival: 12, perDay: 6 },
  { distributor: "US Corporate", product: "Cleats", cover: 18, arrival: 10, perDay: 22 },
].map((r) => ({ ...r, short: Math.max(r.arrival - r.cover, 0) * r.perDay }));

const marDay = (d: number) => `Mar ${d + 1}`;

function CoverMockup() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center justify-between text-[13px]">
        <Tabs items={["Will run out 3", "Covered 2"]} />
        <div className="mb-4 flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-fg/60" />Stock left</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-risk-high" />Gap until the order lands</span>
        </div>
      </div>
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-line-faint border-b">
            <th className="w-[230px] pb-2.5 font-medium">Distributor and product</th>
            <th className="pb-2.5 font-medium">Cover, next 3 weeks</th>
            <th className="w-[90px] pb-2.5 text-right font-medium">Runs out</th>
            <th className="w-[80px] pb-2.5 text-right font-medium">Lands</th>
            <th className="w-[90px] pb-2.5 text-right font-medium">Short</th>
          </tr>
        </thead>
        <tbody>
          {cover.map((r) => (
            <tr key={r.distributor} className="border-line-faint border-b last:border-b-0">
              <td className="py-3.5">
                <p className="font-medium">{r.distributor}</p>
                <p className="text-[12px] text-muted">{r.product}, {r.perDay} a day</p>
              </td>
              <td className="py-3.5 pr-6"><RunwayBar coverDays={r.cover} arrivalDays={r.arrival} windowDays={21} /></td>
              <td className="py-3.5 text-right font-mono">{marDay(r.cover)}</td>
              <td className={`py-3.5 text-right font-mono ${r.short ? "text-risk-high" : ""}`}>{marDay(r.arrival)}</td>
              <td className="py-3.5 text-right font-mono">{r.short ? `${r.short} units` : "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 3. Find the cause ---------- */

const evidence = [
  { source: "News", text: "Port strike reported in Santos, Brazil" },
  { source: "Weather", text: "Heavy rain forecast for São Paulo, Mar 2 to 5" },
  { source: "Order history", text: "Second Class into LATAM running 3.8 days late" },
];

// Top contributions to the predicted delay (SHAP), in days. Features are M1's (ml/build_order_features.py).
const factors = [
  { label: "Second Class shipping", days: 1.9 },
  { label: "LATAM market", days: 1.2 },
  { label: "Consumer segment", days: 0.6 },
  { label: "Outside peak season", days: -0.4 },
];

function CauseMockup() {
  const max = Math.max(...factors.map((f) => Math.abs(f.days)));
  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-line-faint p-5">
        <div className="flex items-center justify-between">
          <RiskBadge band="HIGH" />
          <span className="text-[12px] text-muted">Order #55123 to Brazil Consumer</span>
        </div>
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[12px] text-muted">Probable cause, 72% confidence</p>
          <p className="mt-1.5 font-medium text-[16px] leading-snug">A port strike at Santos is slowing Second Class freight into São Paulo.</p>
          <div className="mt-3 h-1.5 rounded-full bg-line-faint">
            <div className="h-full w-[72%] rounded-full bg-fg" />
          </div>
        </div>
        <div>
          <Label>Evidence</Label>
          <ul className="flex flex-col gap-2.5 text-[13px]">
            {evidence.map((e, i) => (
              <li key={e.text} className="flex items-start gap-3">
                <span className="mt-px rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-fg-2">[{i + 1}]</span>
                <span className="flex-1">{e.text}</span>
                <span className="text-muted">{e.source}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-line-faint p-5">
          <Label>Why the model expects a delay</Label>
          <ul className="flex flex-col gap-3 text-[13px]">
            {factors.map((f) => (
              <li key={f.label}>
                <div className="mb-1 flex justify-between">
                  <span>{f.label}</span>
                  <span className="font-mono text-muted">{f.days > 0 ? "+" : "−"}{Math.abs(f.days).toFixed(1)}d</span>
                </div>
                <div className="h-1.5 rounded-full bg-line-faint">
                  <div className={`h-full rounded-full ${f.days > 0 ? "bg-risk-high" : "bg-risk-low"}`} style={{ width: `${(Math.abs(f.days) / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1 rounded-2xl border border-line-faint p-5">
          <Label>What the agent checked</Label>
          <ul className="flex flex-col gap-2.5 font-mono text-[12px]">
            {[["search_news", "0.6s"], ["get_weather", "0.4s"], ["get_inventory", "0.3s"]].map(([c, ms]) => (
              <li key={c} className="flex justify-between">
                <span><span className="text-risk-low">✓</span> {c}</span>
                <span className="text-muted">{ms}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- 4. Price the damage ---------- */

const incidents = [
  { id: 812, order: 55123, distributor: "Brazil Consumer", market: "LATAM", delay: 7.0, short: 240, money: 1181, status: "Open" },
  { id: 809, order: 55187, distributor: "Germany Corporate", market: "Europe", delay: 2.9, short: 120, money: 642, status: "Open" },
  { id: 815, order: 55301, distributor: "Australia Corporate", market: "Pacific Asia", delay: 2.4, short: 64, money: 310, status: "Escalated" },
  { id: 806, order: 55201, distributor: "Nigeria Home Office", market: "Africa", delay: 2.1, short: 14, money: 88, status: "Open" },
  { id: 803, order: 55288, distributor: "US Home Office", market: "USCA", delay: 1.6, short: 9, money: 41, status: "Approved" },
];

function QueueMockup() {
  const open = incidents.filter((r) => r.status !== "Approved");
  const total = open.reduce((sum, r) => sum + r.money, 0);
  const units = open.reduce((sum, r) => sum + r.short, 0);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          [usd(total), "at risk across open incidents"],
          [String(open.length), "open incidents"],
          [units.toLocaleString("en-US"), "units short"],
        ].map(([n, l], i) => (
          <div key={l} className="rounded-xl border border-line-faint px-4 py-3">
            <p className={`font-mono font-semibold text-[24px] leading-none tracking-[-0.02em] ${i === 0 ? "text-risk-high" : ""}`}>{n}</p>
            <p className="mt-1.5 text-[12px] text-muted">{l}</p>
          </div>
        ))}
      </div>
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-line-faint border-b">
            <th className="w-[100px] pb-2.5 font-medium">Severity</th>
            <th className="pb-2.5 font-medium">Order</th>
            <th className="pb-2.5 font-medium">Distributor</th>
            <th className="pb-2.5 font-medium">Market</th>
            <th className="pb-2.5 text-right font-medium">Delay</th>
            <th className="pb-2.5 text-right font-medium">Short</th>
            <th className="pb-2.5 text-right font-medium">At risk</th>
            <th className="w-[96px] pb-2.5 pl-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((r) => (
            <tr key={r.id} className="border-line-faint border-b last:border-b-0">
              <td className="py-3"><RiskBadge band={riskBand(r.money)} /></td>
              <td className="py-3 font-mono">#{r.order}</td>
              <td className="py-3 font-medium">{r.distributor}</td>
              <td className="py-3 text-muted">{r.market}</td>
              <td className="py-3 text-right font-mono">+{r.delay.toFixed(1)}d</td>
              <td className="py-3 text-right font-mono">{r.short}</td>
              <td className="py-3 text-right font-mono font-medium">{usd(r.money)}</td>
              <td className="py-3 pl-4"><Tag tone={r.status === "Approved" ? "green" : r.status === "Escalated" ? "amber" : "grey"}>{r.status}</Tag></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 5. Approve the fix ---------- */

const fixes = [
  { title: "Upgrade to First Class shipping", cost: "+$340", covers: "Covers 190 of 240 units, lands Mar 15", best: true },
  { title: "Transfer from the USCA warehouse", cost: "+$520", covers: "Covers all 240 units, lands Mar 14", best: false },
  { title: "Split the shipment", cost: "+$180", covers: "Covers 96 of 240 units, lands Mar 13", best: false },
  { title: "Notify the distributor only", cost: "$0", covers: "Covers 0 units, sets expectations", best: false },
];

function FixMockup() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-[16px]">Order #55123 to Brazil Consumer</p>
          <p className="mt-0.5 text-[13px] text-muted">5-day gap, 240 units short, $1,181 at risk</p>
        </div>
        <RiskBadge band={riskBand(1181)} />
      </div>
      <ul className="flex flex-col gap-2.5">
        {fixes.map((f) => (
          <li key={f.title} className={`flex items-center gap-4 rounded-xl border px-5 py-3 ${f.best ? "border-fg/30 bg-surface" : "border-line-faint"}`}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-[14px]">
                {f.title}
                {f.best && <Tag tone="green">Recommended</Tag>}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{f.covers}</p>
            </div>
            <span className="font-mono font-medium text-[14px]">{f.cost}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between border-line-faint border-t pt-4">
        <p className="text-[12px] text-muted">Nothing changes until ops decides. Every decision is logged.</p>
        <div className="flex gap-2 text-[13px] font-medium">
          <span className="rounded-lg border border-line-faint px-3 py-1.5 text-fg">Escalate</span>
          <span className="rounded-lg border border-line-faint px-3 py-1.5 text-fg">Dismiss</span>
          <span className="rounded-lg bg-fg px-3 py-1.5 text-white">Approve</span>
        </div>
      </div>
    </div>
  );
}
