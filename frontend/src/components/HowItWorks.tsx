import {
  Brain, CheckCircle2, CloudSun, Database, FileText, GitFork, LineChart, Sparkles, Radar, Warehouse, Truck, type LucideIcon,
} from "lucide-react";

const steps: { icon: LucideIcon; title: string; text: string; tag: string }[] = [
  { icon: Database, title: "1. Orders arrive", text: "Every new order lands in the database with its product, distributor, warehouse and scheduled shipping time.", tag: "Supabase" },
  { icon: Brain, title: "2. M1 scores delay risk", text: "A model predicts how many days late each in-transit order will be, and SHAP shows exactly why.", tag: "M1 · SHAP" },
  { icon: LineChart, title: "3. M2 forecasts demand", text: "A second model forecasts weekly demand for each product at each warehouse, so we know how fast stock is being used.", tag: "M2 · MLflow" },
  { icon: GitFork, title: "4. The cascade finds the gap", text: "Stock on hand, demand and late arrivals are combined. If stock runs out before the next delivery lands, that is an incident, with dollars at risk and a severity.", tag: "Cascade" },
  { icon: Sparkles, title: "5. The agent investigates", text: "It calls tools for weather, news and delay statistics, reads company policy through RAG, and writes a briefing with ranked options.", tag: "Agent · Langfuse" },
  { icon: CheckCircle2, title: "6. A human decides", text: "Operations reviews the briefing, approves, dismisses or escalates, and the decision is recorded for audit.", tag: "Approval" },
];

const roles: { icon: LucideIcon; name: string; sees: string }[] = [
  { icon: Radar, name: "Operations", sees: "Every market: incidents, briefings, approvals" },
  { icon: Warehouse, name: "Warehouses", sees: "Their own warehouse: stock and inbound orders" },
  { icon: Truck, name: "Distributors", sees: "Their own orders and delivery risk" },
  { icon: Database, name: "Data team", sees: "Models, runs, traces and data quality" },
];

const signals = [
  { icon: CloudSun, label: "Weather and news evidence" },
  { icon: FileText, label: "Policy passages (RAG)" },
  { icon: Brain, label: "SHAP explanations" },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-canvas px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">How it works</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold text-balance text-ink md:text-4xl">
          From a new order to an approved decision, automatically.
        </h2>
        <p className="mt-3 max-w-2xl text-fg-2">
          When data arrives, every step below runs in order. Nobody has to watch a spreadsheet.
        </p>

        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map(({ icon: Icon, title, text, tag }) => (
            <li key={title} className="group rounded-2xl border border-line-subtle bg-white p-6 shadow-soft transition-shadow hover:shadow-md">
              <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-2">{text}</p>
              <span className="mt-4 inline-block rounded-md bg-surface px-2 py-1 text-xs font-medium text-muted">{tag}</span>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          {signals.map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-white">
              <Icon className="size-4 text-signal" /> {label}
            </span>
          ))}
        </div>

        <h3 className="mt-16 font-display text-2xl font-semibold text-ink">Who sees what</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map(({ icon: Icon, name, sees }) => (
            <div key={name} className="rounded-2xl bg-ink p-5 text-white">
              <Icon className="size-6 text-signal" />
              <p className="mt-3 font-display font-semibold">{name}</p>
              <p className="mt-1 text-sm text-white/60">{sees}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}