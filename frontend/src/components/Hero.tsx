import Link from "next/link";
import { ArrowRight, Brain, GitFork, ShieldCheck, Sparkles, Truck } from "lucide-react";

const chips = [
  { icon: Brain, label: "Predicts late orders" },
  { icon: GitFork, label: "Finds the stock gap" },
  { icon: Sparkles, label: "AI agent investigates" },
  { icon: ShieldCheck, label: "You approve the fix" },
];

/** Dark hero with the product promise and a live-looking incident card. */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute -top-32 right-0 size-[560px] rounded-full bg-signal/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-20 size-[480px] rounded-full bg-brand/30 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-signal">
            <Truck className="size-3.5" /> Supply-chain early warning
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-balance md:text-6xl">
            Catch late shipments <span className="text-signal">before they RunOut.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            RunOut predicts which orders will be late, finds exactly where stock will run out, and tells the right person what to do about it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-signal px-6 font-medium text-ink transition-colors hover:bg-signal/90">
              Get started <ArrowRight className="size-4" />
            </Link>
            <a href="#how-it-works" className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 font-medium text-white transition-colors hover:bg-white/10">
              See how it works
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/80 ring-1 ring-white/10">
                <Icon className="size-4 text-signal" /> {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
          <div className="mb-4 flex items-center justify-between text-xs text-white/50">
            <span>Incident · Garmin Approach S4 at Europe warehouse</span>
            <span className="rounded bg-white/10 px-2 py-0.5">Illustrative</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-white/50">Money at risk</p>
              <p className="font-display text-4xl font-semibold">$589.86</p>
            </div>
            <span className="rounded-md bg-risk-high px-2.5 py-1 text-xs font-semibold">HIGH</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
            {[["0.9", "days of cover"], ["5", "orders late"], ["4 days", "stock gap"]].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-white/5 py-3 ring-1 ring-white/10">
                <p className="font-display text-lg font-semibold">{v}</p>
                <p className="text-xs text-white/50">{l}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg bg-signal/10 p-3 text-sm text-white/80 ring-1 ring-signal/30">
            <p className="mb-1 flex items-center gap-2 font-medium text-signal">
              <Sparkles className="size-4" /> Agent briefing
            </p>
            Rotterdam port congestion is delaying 5 orders. Expedite the 2 most urgent and notify the distributor.
          </div>
        </div>
      </div>
    </section>
  );
}