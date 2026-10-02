"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, MotionConfig, animate, motion, useReducedMotion } from "motion/react";
import { RiskBadge } from "./RiskBadge";

gsap.registerPlugin(useGSAP);

/*
 * "The 6-Day Gap" — the hero's looping product story (docs/HERO_PLAN.md §4).
 * Numbers follow the project brief: 10,000 units at 500/day → stockout Oct 21 (day 20).
 * ETA slips Oct 19 → Oct 27 (day 18 → 26) → 6-day gap → 3,000 units short × $4 = $12,000.
 */
const STOCKOUT_DAY = 20;
const ETA_BEFORE = 18;
const ETA_AFTER = 26;
const WINDOW_DAYS = 30;

// Beat timeline (seconds). One beat = one idea on screen.
const BEATS = [0, 2, 4, 7, 10, 13.4] as const; // calm, signals, gap, why, fix, reset
const LOOP = 14;
type Step = 0 | 1 | 2 | 3 | 4 | 5;

const ease = [0.33, 1, 0.68, 1] as const; // ease-out-cubic, same curve as the page
const spring = { type: "spring", stiffness: 400, damping: 38 } as const;

const signals = [
  { label: "Typhoon warning · Yantian", source: "Open-Meteo" },
  { label: "Port congestion 2.3× normal", source: "IMF PortWatch" },
  { label: "Vessel slowed 14 → 9 kn", source: "AIS" },
];
const trace = [
  { call: "get_weather", ms: "0.4s" },
  { call: "get_port_congestion", ms: "0.3s" },
  { call: "search_news", ms: "0.6s" },
];
const options = [
  { title: "Split 40% to Berner Plastic (Valencia)", cost: "+$3,100", closes: "closes 4 of 6 days" },
  { title: "Reallocate from Dallas depot", cost: "+$900", closes: "closes 2 days" },
  { title: "Air-freight 1 pallet", cost: "+$5,800", closes: "closes 6 days" },
];

const pct = (day: number) => `${(day / WINDOW_DAYS) * 100}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function HeroStory({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(0);
  const [units, setUnits] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Design at a fixed size, then scale to fit the window (crisp text at any width).
  const W = compact ? 560 : 1152;
  const H = compact ? 470 : 620;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(e.contentRect.width / W, e.contentRect.height / H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // Master timeline: GSAP owns *when*, Motion owns *how* each element moves.
  useGSAP(() => {
    if (reduce) {
      setStep(4);
      return;
    }
    const tl = gsap.timeline({ repeat: -1 });
    BEATS.forEach((at, s) =>
      tl.call(() => {
        if (s === 0) setUnits(0); // new loop: counters back to zero
        setStep(s as Step);
      }, [], at),
    );
    tl.set({}, {}, LOOP);
    // Recording hook (app/capture/hero-story): the recorder scrubs this timeline frame by frame.
    const w = window as unknown as { __storyCapture?: boolean; __storyTimeline?: gsap.core.Timeline };
    if (w.__storyCapture) {
      tl.pause(0);
      w.__storyTimeline = tl;
      return;
    }
    // Only run while the hero is on screen.
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause()));
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, { dependencies: [reduce] });

  // Units-short counter ticks up in the gap beat; $ is derived (× $4 margin).
  useEffect(() => {
    if (step !== 2 && !(reduce && step === 4)) return;
    const c = animate(0, 3000, { duration: reduce ? 0 : 1.6, delay: reduce ? 0 : 0.9, ease, onUpdate: setUnits });
    return () => c.stop();
  }, [step, reduce]);

  const late = step >= 2 && step < 5;
  const eta = late ? ETA_AFTER : ETA_BEFORE;

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} data-step={step} className="relative h-full w-full overflow-hidden bg-white" aria-label="RunOut flags a 6-day stockout gap and recommends a costed fix" role="img">
        <div

          className="absolute left-1/2 top-1/2 font-sans text-fg"
          style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <motion.div className="h-full w-full" animate={{ opacity: step === 5 ? 0 : 1 }} transition={{ duration: 0.5, ease }}>
            {/* Top bar */}
            <div className="flex h-12 items-center justify-between border-b border-line-faint px-6 text-[13px]">
              <span className="text-muted">
                Watchtower <span className="mx-1.5 text-line">/</span>
                <span className="font-medium text-fg">EasyWring refill heads</span>
              </span>
              <span className="flex items-center gap-2 text-muted">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-low opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-risk-low" />
                </span>
                Live · Oct 1, 2026
              </span>
            </div>

            <div className={`grid gap-5 p-6 ${compact ? "grid-cols-1" : "grid-cols-[1.25fr_1fr]"}`}>
              {/* Left: the shipment and what it means for stock */}
              <div className="flex flex-col gap-5">
                <ShipmentCard eta={eta} late={late} step={step} />
                <StockCard late={late} units={units} step={step} />
              </div>

              {/* Right: one panel per beat */}
              {!compact && (
                <div className="relative rounded-2xl border border-line-faint bg-surface/60 p-5">
                  <AnimatePresence mode="wait">
                    {step <= 2 && <SignalsPanel key="signals" show={step >= 1} />}
                    {step === 3 && <WhyPanel key="why" />}
                    {step >= 4 && <FixPanel key="fix" reduce={!!reduce} />}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-faint bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

function ShipmentCard({ eta, late, step }: { eta: number; late: boolean; step: Step }) {
  return (
    <Card
      title="Shipment · Wise Industrial"
      right={
        <span className="flex items-center gap-2 text-[13px] text-muted">
          ETA
          <span className="relative inline-flex h-6 min-w-[64px] items-center justify-center overflow-hidden rounded-md bg-surface px-2 font-mono text-[13px] font-medium text-fg">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={eta}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.45, ease }}
              >
                Oct {eta + 1}
              </motion.span>
            </AnimatePresence>
          </span>
          <AnimatePresence>
            {late && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ ...spring, delay: 0.3 }}
                className="rounded-md bg-red-50 px-1.5 py-0.5 font-mono text-[12px] font-medium text-risk-high"
              >
                +8d
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      }
    >
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium">Yantian</span>
        <span className="text-muted">{step >= 1 && step < 5 ? "Pacific · 9 kn" : "Pacific · 14 kn"}</span>
        <span className="font-medium">Long Beach</span>
      </div>
      {/* Route: travelled solid, remaining dashed, ship dot drifting east */}
      <div className="relative mt-3 h-6">
        <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-[repeating-linear-gradient(90deg,var(--color-line)_0_6px,transparent_6px_11px)]" />
        <motion.div
          className="absolute left-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-fg"
          initial={{ width: "46%" }}
          animate={{ width: step === 0 ? "46%" : "54%" }}
          transition={{ duration: step === 0 ? 0 : 11, ease: "linear" }}
        />
        <motion.div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ left: "46%" }}
          animate={{ left: step === 0 ? "46%" : "54%" }}
          transition={{ duration: step === 0 ? 0 : 11, ease: "linear" }}
        >
          <span className="flex size-6 items-center justify-center rounded-full border border-line-faint bg-white shadow-sm">
            <svg viewBox="0 0 16 16" className="size-3.5 text-fg" fill="currentColor" aria-hidden>
              <path d="M2 9h12l-1.6 3.2a1.5 1.5 0 0 1-1.34.8H4.94a1.5 1.5 0 0 1-1.34-.8L2 9Zm3-5h4v4H5V4Zm5 1.5h2.5V8H10V5.5Z" />
            </svg>
          </span>
        </motion.div>
        <span className="absolute left-0 top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-fg bg-white" />
        <span className="absolute right-0 top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-fg bg-white" />
      </div>
    </Card>
  );
}

function StockCard({ late, units, step }: { late: boolean; units: number; step: Step }) {
  const money = units * 4;
  return (
    <Card title="Long Beach DC · 10,000 units · 500/day" right={<RiskBadge band={late ? "HIGH" : "COVERED"} />}>
      {/* Runway: stock burns from today to the stockout date; red gap until the ship lands */}
      <div className="relative pt-7">
        <motion.span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] font-medium text-fg"
          style={{ left: pct(STOCKOUT_DAY) }}
        >
          Stockout Oct 21
        </motion.span>
        <div className="relative h-3 rounded-full bg-line-faint">
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-fg/85 to-fg/25" style={{ width: pct(STOCKOUT_DAY) }} />
          <motion.div
            className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(-45deg,var(--color-risk-high)_0_4px,#fca5a5_4px_8px)]"
            style={{ left: pct(STOCKOUT_DAY) }}
            initial={false}
            animate={{ width: late ? pct(ETA_AFTER - STOCKOUT_DAY) : "0%" }}
            transition={{ duration: 1.1, delay: late ? 0.6 : 0, ease }}
          />
          <span className="absolute -top-1 bottom-[-4px] w-px bg-fg/70" style={{ left: pct(STOCKOUT_DAY) }} />
          <motion.span
            className={`absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${late ? "bg-risk-high" : "bg-risk-low"}`}
            initial={false}
            animate={{ left: pct(late ? ETA_AFTER : ETA_BEFORE) }}
            transition={{ duration: 1.1, delay: late ? 0.6 : 0, ease }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
          <span>Oct 1</span>
          <span>Oct 11</span>
          <span>Oct 21</span>
          <span>Oct 31</span>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between border-t border-line-faint pt-4">
        <div>
          <p className={`font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] ${money > 0 ? "text-risk-high" : "text-fg"}`}>{usd(money)}</p>
          <p className="mt-1.5 text-[13px] text-muted">at risk</p>
        </div>
        <div className="text-right text-[13px]">
          <p className="font-mono font-medium">{Math.round(units).toLocaleString("en-US")} units short</p>
          <p className="mt-1 text-muted">{late ? `${ETA_AFTER - STOCKOUT_DAY}-day gap` : step === 0 ? "Arrives 2 days early" : "Watching…"}</p>
        </div>
      </div>
    </Card>
  );
}

const panelIn = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.35, ease } };

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[12px] font-medium uppercase tracking-wide text-muted">{children}</p>;
}

function SignalsPanel({ show }: { show: boolean }) {
  return (
    <motion.div {...panelIn}>
      <PanelTitle>Signals</PanelTitle>
      <ul className="space-y-2.5">
        {signals.map((s, i) => (
          <motion.li
            key={s.label}
            initial={{ opacity: 0, x: 24 }}
            animate={show ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ ...spring, delay: show ? i * 0.6 : 0 }}
            className="flex items-center justify-between rounded-xl border border-line-faint bg-white px-4 py-3 text-[14px]"
          >
            <span className="flex items-center gap-2.5 font-medium">
              <span className="size-2 rounded-full bg-risk-med" />
              {s.label}
            </span>
            <span className="text-[12px] text-muted">{s.source}</span>
          </motion.li>
        ))}
      </ul>
      {!show && <p className="mt-6 text-[13px] text-muted">All lanes quiet. Watching 4 data sources.</p>}
    </motion.div>
  );
}

function WhyPanel() {
  return (
    <motion.div {...panelIn}>
      <PanelTitle>Investigation</PanelTitle>
      <ul className="space-y-2 font-mono text-[13px]">
        {trace.map((t, i) => (
          <motion.li
            key={t.call}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: i * 0.5 }}
            className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
          >
            <span>
              <span className="text-risk-low">✓</span> {t.call}()
            </span>
            <span className="text-muted">{t.ms}</span>
          </motion.li>
        ))}
      </ul>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 1.7 }}
        className="mt-4 rounded-xl border border-line-faint bg-white p-4"
      >
        <p className="text-[12px] text-muted">Probable cause · 82% confidence</p>
        <p className="mt-1 text-[15px] font-medium leading-snug">Typhoon closing Yantian berths; vessel holding offshore.</p>
        <div className="mt-3 flex gap-1.5">
          {["Open-Meteo", "PortWatch", "AIS"].map((c, i) => (
            <span key={c} className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-fg-2">
              [{i + 1}] {c}
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function FixPanel({ reduce }: { reduce: boolean }) {
  // Cursor glides to the first option and approves it (instant when motion is reduced).
  const d = (s: number) => (reduce ? 0 : s);
  return (
    <motion.div {...panelIn} className="relative">
      <PanelTitle>Recommended actions</PanelTitle>
      <ul className="space-y-2.5">
        {options.map((o, i) => (
          <motion.li
            key={o.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: d(i * 0.3) }}
            className="relative rounded-xl border bg-white px-4 py-3"
            style={{ borderColor: "var(--color-line-faint)" }}
          >
            {i === 0 && (
              <motion.span
                className="pointer-events-none absolute -inset-px rounded-xl border-2 border-risk-low"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: d(2.1) }}
              />
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-medium">{o.title}</p>
              {i === 0 ? (
                <motion.span
                  className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium"
                  initial={{ backgroundColor: "#202124", color: "#f3f4f6" }}
                  animate={{ backgroundColor: "#16a34a", color: "#ffffff" }}
                  transition={{ duration: 0.25, delay: d(2.1) }}
                >
                  Approve
                </motion.span>
              ) : (
                <span className="shrink-0 rounded-lg border border-line-faint px-2.5 py-1 text-[12px] text-fg-2">Review</span>
              )}
            </div>
            <p className="mt-1 font-mono text-[12px] text-muted">
              {o.cost} · {o.closes}
            </p>
          </motion.li>
        ))}
      </ul>
      {!reduce && (
        <motion.svg
          viewBox="0 0 16 16"
          className="pointer-events-none absolute size-5 drop-shadow"
          initial={{ left: "40%", top: "105%", opacity: 0 }}
          animate={{ left: "88%", top: "26%", opacity: 1, scale: [1, 1, 0.85, 1] }}
          transition={{ duration: 1.1, delay: 1.0, ease, scale: { times: [0, 0.8, 0.9, 1], duration: 1.4, delay: 1.0 } }}
          aria-hidden
        >
          <path d="M2 1l11 6.5-5 1.2L5.7 14 2 1z" fill="#1c1d1f" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
        </motion.svg>
      )}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: d(2.4) }}
        className="mt-4 flex items-center gap-2 rounded-lg bg-fg px-3 py-2 text-[13px] text-white"
      >
        <span className="text-risk-low">✓</span> Approved · sent to #supply-ops
      </motion.div>
    </motion.div>
  );
}
