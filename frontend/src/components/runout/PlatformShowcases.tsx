// Mock-ups for the Platform tabs in IntelligentSystem. Lives in runout/ so Tailwind compiles its classes.
import { RiskBadge } from "./RiskBadge";
import { RunwayBar } from "./RunwayBar";
import { riskBand, usd } from "./risk";
import { WindowDots } from "../ui/WindowDots";

// Ids must match PlatformNav's items.
export const showcases = [
  { id: "watch-shipments", title: "Every order, every route.", line: "Connect your orders and carriers once, and RunOut tracks every shipment from factory to shelf.", crumb: "Shipments", Mockup: ShipmentsMockup },
  { id: "read-the-world", title: "Signals, not noise.", line: "Port congestion, weather, strikes and carrier delays get matched to the shipments they'll actually hit.", crumb: "Signals", Mockup: SignalsMockup },
  { id: "flag-delays-early", title: "Know days before your 3PL does.", line: "Every risk comes with a probable cause and a confidence score, so you act on facts, not hunches.", crumb: "Alerts", Mockup: AlertMockup },
  { id: "price-the-risk", title: "See the money, not just the map.", line: "Days until you run out and dollars at risk for every product, sorted from high to low.", crumb: "Exposure", Mockup: ExposureMockup },
  { id: "act-before-you-run-out", title: "Fix it while it's cheap.", line: "Expedite, move stock between depots, or split the order to a backup supplier, with the cost of each laid out.", crumb: "Fixes", Mockup: FixesMockup },
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
          Live · Oct 1, 2026
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

function Pill({ tone, children }: { tone: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-flex h-6 items-center rounded-md px-2 font-medium text-[12px] ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 font-medium text-[12px] text-muted uppercase tracking-wide">{children}</p>;
}

/* ---------- 1. Watch shipments ---------- */

const shipments = [
  { product: "EasyWring refill heads", supplier: "Wise Industrial", route: "Yantian → Long Beach", eta: "Oct 27", status: ["red", "Delayed +8d"] },
  { product: "Bucket wringers", supplier: "Wise Industrial", route: "Ningbo → Oakland", eta: "Oct 22", status: ["amber", "Watching"] },
  { product: "Spray mop frames", supplier: "Wise Industrial", route: "Yantian → Long Beach", eta: "Oct 22", status: ["green", "On time"] },
  { product: "Microfibre pads", supplier: "Berner Plastic", route: "Valencia → Savannah", eta: "Oct 18", status: ["green", "On time"] },
  { product: "Handle extensions", supplier: "Wise Industrial", route: "Shenzhen → Long Beach", eta: "Nov 3", status: ["green", "On time"] },
  { product: "Refill solution 1L", supplier: "Berner Plastic", route: "Valencia → New York", eta: "Oct 14", status: ["grey", "Arrived"] },
] as const;

function ShipmentsMockup() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex gap-2 text-[13px]">
        {["All 24", "In transit 18", "At risk 2", "Arrived 4"].map((t, i) => (
          <span key={t} className={`rounded-md px-2.5 py-1 ${i === 0 ? "bg-surface font-medium text-fg" : "text-muted"}`}>{t}</span>
        ))}
      </div>
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-line-faint border-b">
            <th className="pb-2.5 font-medium">Product</th>
            <th className="pb-2.5 font-medium">Supplier</th>
            <th className="pb-2.5 font-medium">Route</th>
            <th className="pb-2.5 font-medium">ETA</th>
            <th className="pb-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.product} className="border-line-faint border-b last:border-b-0">
              <td className="py-3.5 font-medium">{s.product}</td>
              <td className="py-3.5 text-muted">{s.supplier}</td>
              <td className="py-3.5">{s.route}</td>
              <td className="py-3.5 font-mono">{s.eta}</td>
              <td className="py-3.5 text-right"><Pill tone={s.status[0]}>{s.status[1]}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 2. Read the world ---------- */

const events = [
  { time: "02:14", label: "Typhoon warning · Yantian", source: "Open-Meteo", hits: ["EasyWring refill heads", "Spray mop frames"], tone: "red" },
  { time: "01:52", label: "Port congestion 2.3× normal · Yantian", source: "IMF PortWatch", hits: ["EasyWring refill heads"], tone: "amber" },
  { time: "01:30", label: "Vessel slowed 14 → 9 kn · MSC Aurora", source: "AIS", hits: ["EasyWring refill heads"], tone: "amber" },
  { time: "00:47", label: "Dock workers vote on strike · Oakland", source: "News", hits: ["Bucket wringers"], tone: "amber" },
  { time: "00:05", label: "Heavy rain · Valencia", source: "Open-Meteo", hits: [], tone: "grey" },
] as const;

function SignalsMockup() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between text-[13px]">
        <span className="text-muted">Watching 4 data sources · 312 signals today</span>
        <span className="text-muted">5 matched to your shipments</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {events.map((e) => (
          <li key={e.label} className="flex items-center gap-4 rounded-xl border border-line-faint px-4 py-3">
            <span className="w-11 shrink-0 font-mono text-[12px] text-muted">{e.time}</span>
            <span className={`size-2 shrink-0 rounded-full ${e.tone === "red" ? "bg-risk-high" : e.tone === "amber" ? "bg-risk-med" : "bg-line"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[13px]">{e.label}</p>
              <p className="text-[12px] text-muted">{e.source}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {e.hits.length ? e.hits.map((h) => <Pill key={h} tone="grey">{h}</Pill>) : <span className="text-[12px] text-muted">No shipments affected</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 3. Flag delays early ---------- */

function AlertMockup() {
  return (
    <div className="grid h-full grid-cols-[1.3fr_1fr] gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-line-faint p-5">
        <div className="flex items-center justify-between">
          <Pill tone="red">Delay flagged</Pill>
          <span className="text-[12px] text-muted">Flagged 02:16 · 9 days before your 3PL</span>
        </div>
        <div>
          <p className="font-medium text-[18px]">EasyWring refill heads</p>
          <p className="mt-1 text-[13px] text-muted">Wise Industrial · Yantian → Long Beach</p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[14px]">
          <span className="text-muted line-through">ETA Oct 19</span>
          <span>→</span>
          <span className="font-medium">ETA Oct 27</span>
          <span className="rounded-md bg-red-50 px-1.5 py-0.5 font-medium text-[12px] text-risk-high">+8d</span>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-[12px]">
            <span className="text-muted">Long Beach DC · stock runs out Oct 21</span>
            <span className="font-medium text-risk-high">6-day gap · $12,000 at risk</span>
          </div>
          <RunwayBar coverDays={20} arrivalDays={26} />
        </div>
        <div className="mt-auto rounded-xl bg-surface p-4">
          <p className="text-[12px] text-muted">Probable cause · 82% confidence</p>
          <p className="mt-1.5 font-medium text-[14px]">Typhoon closing Yantian berths; vessel holding offshore.</p>
          <div className="mt-3 h-1.5 rounded-full bg-line-faint">
            <div className="h-full w-[82%] rounded-full bg-fg" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-line-faint p-5">
          <Label>Evidence</Label>
          <ul className="flex flex-col gap-3 text-[13px]">
            {[["Typhoon warning · Yantian", "Open-Meteo"], ["Port congestion 2.3× normal", "IMF PortWatch"], ["Vessel slowed 14 → 9 kn", "AIS"]].map(([l, s]) => (
              <li key={l} className="flex justify-between gap-3">
                <span>{l}</span>
                <span className="text-muted">{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1 rounded-2xl border border-line-faint p-5">
          <Label>Checked</Label>
          <ul className="flex flex-col gap-2.5 font-mono text-[12px]">
            {[["get_weather", "0.4s"], ["get_port_congestion", "0.3s"], ["search_news", "0.6s"]].map(([c, ms]) => (
              <li key={c} className="flex justify-between">
                <span>{c}</span>
                <span className="text-muted">{ms}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- 4. Price the risk ---------- */

// money at risk = days short × units/day × margin per unit (same maths as the Hero: 6d × 500 × $4 = $12,000).
const exposure = [
  { product: "Bucket wringers", cover: 12, arrival: 21, perDay: 400, margin: 15 },
  { product: "EasyWring refill heads", cover: 20, arrival: 26, perDay: 500, margin: 4 },
  { product: "Spray mop frames", cover: 18, arrival: 21, perDay: 300, margin: 6 },
  { product: "Microfibre pads", cover: 25, arrival: 17, perDay: 800, margin: 2 },
  { product: "Handle extensions", cover: 28, arrival: 25, perDay: 150, margin: 5 },
].map((r) => ({ ...r, gap: Math.max(r.arrival - r.cover, 0), money: Math.max(r.arrival - r.cover, 0) * r.perDay * r.margin }));

function ExposureMockup() {
  const total = exposure.reduce((sum, r) => sum + r.money, 0);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="font-mono font-semibold text-[34px] text-risk-high leading-none tracking-[-0.03em]">{usd(total)}</p>
          <p className="mt-1.5 text-[13px] text-muted">at risk across 5 products · next 30 days</p>
        </div>
        <div className="flex gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-fg/60" />Stock left</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-risk-high" />Gap until shipment lands</span>
        </div>
      </div>
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-line-faint border-b">
            <th className="w-[210px] pb-2.5 font-medium">Product</th>
            <th className="pb-2.5 font-medium">Runway (30 days)</th>
            <th className="w-[80px] pb-2.5 text-right font-medium">Gap</th>
            <th className="w-[100px] pb-2.5 text-right font-medium">At risk</th>
            <th className="w-[100px] pb-2.5 text-right font-medium">Level</th>
          </tr>
        </thead>
        <tbody>
          {exposure.map((r) => (
            <tr key={r.product} className="border-line-faint border-b last:border-b-0">
              <td className="py-4 font-medium">{r.product}</td>
              <td className="py-4 pr-6"><RunwayBar coverDays={r.cover} arrivalDays={r.arrival} /></td>
              <td className="py-4 text-right font-mono">{r.gap ? `${r.gap}d` : "—"}</td>
              <td className="py-4 text-right font-mono">{usd(r.money)}</td>
              <td className="py-4 text-right"><RiskBadge band={riskBand(r.money)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 5. Act before you run out ---------- */

const fixes = [
  { title: "Split 40% to Berner Plastic (Valencia)", cost: "+$3,100", closes: "Closes 4 of 6 days", saves: "Saves $8,000", best: true },
  { title: "Reallocate from Dallas depot", cost: "+$900", closes: "Closes 2 of 6 days", saves: "Saves $4,000", best: false },
  { title: "Air-freight 1 pallet", cost: "+$5,800", closes: "Closes 6 of 6 days", saves: "Saves $12,000", best: false },
];

function FixesMockup() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-[16px]">EasyWring refill heads</p>
          <p className="mt-0.5 text-[13px] text-muted">6-day gap · 3,000 units short · $12,000 at risk</p>
        </div>
        <RiskBadge band={riskBand(12_000)} />
      </div>
      <ul className="flex flex-col gap-3">
        {fixes.map((f) => (
          <li key={f.title} className={`flex items-center gap-4 rounded-xl border px-5 py-4 ${f.best ? "border-fg/30 bg-surface" : "border-line-faint"}`}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-[14px]">
                {f.title}
                {f.best && <Pill tone="green">Recommended</Pill>}
              </p>
              <p className="mt-1 text-[13px] text-muted">{f.closes} · {f.saves}</p>
            </div>
            <span className="font-mono font-medium text-[14px]">{f.cost}</span>
            <span className={`rounded-lg px-3 py-1.5 font-medium text-[13px] ${f.best ? "bg-fg text-white" : "border border-line-faint text-fg"}`}>
              {f.best ? "Approve" : "Review"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-[12px] text-muted">Costs from your carrier rates and supplier quotes. Nothing changes until you approve.</p>
    </div>
  );
}
