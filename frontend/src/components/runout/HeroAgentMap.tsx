"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";

gsap.registerPlugin(useGSAP);

/*
 * The hero's looping story (docs/LANDING_V2.md): the distribution network, with RunOut's four agents
 * working one late order from flag to approved fix. Numbers match the Platform mock-ups: order #55123
 * to Brazil Consumer, 7 days late, 240 units short, $1,181 at risk, port strike at Santos (72%).
 */

// Beat timeline (seconds): calm, flag, investigate, procure, decide, reset.
const BEATS = [0, 2, 4.5, 7.5, 10, 13.4] as const;
const LOOP = 14;
type Step = 0 | 1 | 2 | 3 | 4 | 5;

const ease = [0.33, 1, 0.68, 1] as const;
const spring = { type: "spring", stiffness: 400, damping: 38 } as const;

/* ---------- Network geometry (SVG units, map area 720×552) ---------- */

const MARKETS = [
  { name: "Europe", country: "Germany" },
  { name: "USCA", country: "US" },
  { name: "LATAM", country: "Brazil" },
  { name: "Africa", country: "Nigeria" },
  { name: "Pacific Asia", country: "Australia" },
];
const SEGMENTS = ["Consumer", "Corporate", "Home Office"];
const WX = 130; // warehouse column
const DX = 540; // distributor column
const wy = (i: number) => 70 + i * 103;
const dy = (i: number, j: number) => wy(i) + (j - 1) * 30;
const curve = (y1: number, y2: number, x1 = WX, x2 = DX) => `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;

const links = MARKETS.flatMap((m, i) => SEGMENTS.map((s, j) => ({ key: `${i}-${j}`, i, j, label: `${m.country} ${s}`, d: curve(wy(i), dy(i, j)) })));
const FLAGGED = "2-0"; // LATAM → Brazil Consumer
const TRANSFER = curve(wy(1), dy(2, 0)); // USCA warehouse → Brazil Consumer, the transfer option

const GREY = "#d5dae1";
const RED = "#dc2626";
const GREEN = "#16a34a";

/* ---------- Agents ---------- */

const agents = [
  { name: "Risk Monitor", idle: "Watching 1,284 orders", done: "Order #55123 flagged: 240 units short, $1,181 at risk" },
  { name: "Investigation", idle: "Waiting", done: "Probable cause: port strike at Santos, 72% confidence" },
  { name: "Procurement", idle: "Waiting", done: "3 costed options. Best: First Class shipping, +$340" },
  { name: "Briefing", idle: "Waiting", done: "Briefing ready for ops" },
];
const checks = ["search_news: port strike in Santos", "get_weather: heavy rain, São Paulo", "get_inventory: 576 units, 48 a day"];
const options = [
  ["Upgrade to First Class", "+$340", "190 of 240 units"],
  ["Transfer from USCA warehouse", "+$520", "all 240 units"],
  ["Notify distributor only", "$0", "0 units"],
];

// Which beat each agent works in, and from which beat it is done (Briefing finishes as the decision appears).
const WORKS_AT = [0, 2, 3, -1];
const DONE_FROM = [1, 3, 4, 4];
const status = (k: number, step: Step) => (step === 5 ? "idle" : step >= DONE_FROM[k] ? "done" : step === WORKS_AT[k] ? "working" : "idle");

export function HeroAgentMap({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(0);
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Designed at a fixed size, scaled to fit the window (crisp text at any width).
  const W = compact ? 560 : 1152;
  const H = compact ? 470 : 620;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(e.contentRect.width / W, e.contentRect.height / H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // GSAP owns *when* (the beats), Motion owns *how* each element moves.
  useGSAP(() => {
    if (reduce) {
      setStep(4);
      return;
    }
    const tl = gsap.timeline({ repeat: -1 });
    BEATS.forEach((at, s) => tl.call(() => setStep(s as Step), [], at));
    tl.set({}, {}, LOOP);
    // Recording hook (app/capture/hero-story, npm run video:hero): the recorder scrubs this timeline.
    const w = window as unknown as { __storyCapture?: boolean; __storyTimeline?: gsap.core.Timeline };
    if (w.__storyCapture) {
      tl.pause(0);
      w.__storyTimeline = tl;
      return;
    }
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause()));
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, { dependencies: [reduce] });

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        data-step={step}
        role="img"
        aria-label="RunOut's network map: an order to Brazil Consumer is flagged late, four agents investigate it and draft costed options, and ops approves the fix"
        className="relative h-full w-full overflow-hidden bg-white"
      >
        <div className="absolute top-1/2 left-1/2 font-sans text-fg" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <motion.div className="flex h-full w-full flex-col" animate={{ opacity: step === 5 ? 0 : 1 }} transition={{ duration: 0.5, ease }}>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line-faint px-6 text-[13px]">
              <span className="text-muted">
                Watchtower <span className="mx-1.5 text-line">/</span>
                <span className="font-medium text-fg">Network</span>
              </span>
              <span className="flex items-center gap-2 text-muted">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-low opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-risk-low" />
                </span>
                Live, as of Mar 1
              </span>
            </div>

            <div className={`flex min-h-0 flex-1 ${compact ? "flex-col" : ""}`}>
              {!compact && <NetworkMap step={step} reduce={!!reduce} />}
              <AgentPanel step={step} reduce={!!reduce} compact={compact} />
            </div>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}

/* ---------- Map ---------- */

function NetworkMap({ step, reduce }: { step: Step; reduce: boolean }) {
  const flagged = step >= 1 && step <= 4;
  return (
    <div className="relative w-[720px] shrink-0 border-r border-line-faint">
      <svg viewBox="0 0 720 572" className="h-full w-full" aria-hidden>
        {links.map((l) => {
          const hot = l.key === FLAGGED && flagged;
          return (
            <g key={l.key}>
              <motion.path
                d={l.d}
                fill="none"
                strokeLinecap="round"
                initial={false}
                animate={{ stroke: hot ? (step === 4 ? GREEN : RED) : GREY, strokeWidth: hot ? 2.5 : 1.25 }}
                transition={{ duration: 0.5, delay: hot && step === 4 && !reduce ? 1.8 : 0 }}
              />
              {/* An order travelling along each link. */}
              {!reduce && (
                <circle r={hot ? 3.5 : 2.5} fill={hot ? RED : "#9aa3af"}>
                  <animateMotion dur={`${hot ? 7 : 3 + ((l.i * 3 + l.j) % 5) * 0.6}s`} begin={`-${((l.i * 7 + l.j * 3) % 10) * 0.4}s`} repeatCount="indefinite" path={l.d} />
                </circle>
              )}
            </g>
          );
        })}

        {/* The transfer option, sketched on the map while Procurement weighs it. */}
        <motion.path
          d={TRANSFER}
          fill="none"
          stroke="#d97706"
          strokeWidth={2.5}
          strokeDasharray="5 6"
          initial={false}
          animate={{ opacity: step === 3 ? 1 : 0, pathLength: step === 3 ? 1 : 0 }}
          transition={{ duration: 0.9, delay: step === 3 && !reduce ? 1.2 : 0, ease }}
        />

        {MARKETS.map((m, i) => (
          <g key={m.name}>
            <rect x={WX - 9} y={wy(i) - 9} width={18} height={18} rx={5} fill="#fff" stroke="#1c1d1f" strokeWidth={1.5} />
            <text x={WX - 20} y={wy(i) + 4} textAnchor="end" fontSize={13} fontWeight={600} fill="#1c1d1f">{m.name}</text>
            <text x={WX - 20} y={wy(i) + 20} textAnchor="end" fontSize={11} fill="#6d7988">warehouse</text>
          </g>
        ))}
        {links.map((l) => {
          const hot = l.key === FLAGGED && flagged;
          return (
            <g key={`d-${l.key}`}>
              <motion.circle
                cx={DX}
                cy={dy(l.i, l.j)}
                r={5}
                strokeWidth={1.5}
                initial={false}
                animate={{ fill: hot ? (step === 4 ? GREEN : RED) : "#fff", stroke: hot ? (step === 4 ? GREEN : RED) : "#9aa3af" }}
                transition={{ duration: 0.4, delay: hot && step === 4 && !reduce ? 1.8 : 0 }}
              />
              <text x={DX + 14} y={dy(l.i, l.j) + 4} fontSize={12} fontWeight={hot ? 600 : 400} fill={hot ? "#1c1d1f" : "#6d7988"}>{l.label}</text>
            </g>
          );
        })}
      </svg>

      {/* Callout next to the flagged distributor. */}
      <AnimatePresence>
        {flagged && (
          <motion.div
            key="callout"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ ...spring, delay: step === 1 && !reduce ? 0.4 : 0 }}
            className="absolute rounded-xl border border-line-faint bg-white px-3.5 py-2.5 text-[12px] shadow-[0_8px_24px_-12px_rgb(16_24_40/0.25)]"
            style={{ left: 205, top: wy(2) + 22 }} // below the red line, clear of the distributor labels
          >
            <p className="font-medium text-[13px]">Order #55123, Second Class</p>
            <p className="mt-0.5 text-muted">
              {step === 4 ? (
                <span className="text-risk-low">Fix approved, lands Mar 15</span>
              ) : (
                <>
                  <span className="font-medium text-risk-high">+7 days late.</span> Brazil Consumer runs out Mar 13
                </>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Agents ---------- */

function AgentPanel({ step, reduce, compact }: { step: Step; reduce: boolean; compact: boolean }) {
  const d = (s: number) => (reduce ? 0 : s);
  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-3 bg-surface/50 p-5">
      {compact && (
        <p className="text-[13px] text-muted">
          LATAM warehouse → <span className="font-medium text-fg">Brazil Consumer</span>
          {step >= 1 && step <= 4 && <span className="ml-2 font-medium text-risk-high">+7 days late</span>}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {agents.map((a, k) => {
          const st = status(k, step);
          return (
            <li key={a.name} className={`rounded-xl border bg-white px-4 py-3 transition-colors duration-300 ${st === "working" ? "border-fg/25" : "border-line-faint"}`}>
              <div className="flex items-center gap-2.5">
                <StatusDot status={st} />
                <span className="text-[14px] font-medium">{a.name}</span>
                <span className="ml-auto text-[12px] text-muted">{st === "done" ? "Done" : st === "working" ? "Working" : ""}</span>
              </div>
              <p className={`mt-1 pl-[18px] text-[12.5px] leading-snug ${st === "done" ? "text-fg-2" : "text-muted"}`}>
                {st === "done" ? a.done : st === "working" && k > 0 ? workingLine(k) : a.idle}
              </p>
              {/* Investigation shows its checks while it works. */}
              {k === 1 && st === "working" && (
                <ul className="mt-2 flex flex-col gap-1 pl-[18px] font-mono text-[11.5px]">
                  {checks.map((c, i) => (
                    <motion.li key={c} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: d(0.3 + i * 0.6) }}>
                      <span className="text-risk-low">✓</span> {c}
                    </motion.li>
                  ))}
                </ul>
              )}
              {/* Procurement lists the options it is costing. */}
              {k === 2 && st === "working" && (
                <ul className="mt-2 flex flex-col gap-1 pl-[18px] text-[12px]">
                  {options.map(([t, cost, cover], i) => (
                    <motion.li key={t} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: d(0.3 + i * 0.4) }} className="flex justify-between gap-3">
                      <span>{t}</span>
                      <span className="font-mono text-muted">{cost}, {cover}</span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {/* The decision: ops approves; nothing happens before that. */}
      <AnimatePresence>
        {step === 4 && (
          <motion.div key="decision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="relative mt-auto rounded-xl border border-line-faint bg-white p-4">
            <p className="text-[12px] text-muted">Waiting for ops</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[14px] font-medium">Upgrade to First Class, +$340</p>
              <motion.span
                className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium"
                initial={{ backgroundColor: "#202124", color: "#f3f4f6" }}
                animate={{ backgroundColor: GREEN, color: "#ffffff" }}
                transition={{ duration: 0.25, delay: d(1.6) }}
              >
                Approve
              </motion.span>
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d(2) }} className="mt-2 text-[12px] text-risk-low">
              ✓ Approved. Brazil Consumer sees the new date, Mar 15.
            </motion.p>
            {!reduce && (
              <motion.svg
                viewBox="0 0 16 16"
                className="pointer-events-none absolute size-5 drop-shadow"
                initial={{ left: "45%", top: "120%", opacity: 0 }}
                animate={{ left: "88%", top: "48%", opacity: 1, scale: [1, 1, 0.85, 1] }}
                transition={{ duration: 0.9, delay: 0.6, ease, scale: { times: [0, 0.8, 0.9, 1], duration: 1.1, delay: 0.6 } }}
                aria-hidden
              >
                <path d="M2 1l11 6.5-5 1.2L5.7 14 2 1z" fill="#1c1d1f" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
              </motion.svg>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function workingLine(k: number) {
  return ["", "Checking news, weather and stock", "Costing the options", "Writing the briefing"][k];
}

function StatusDot({ status: st }: { status: "idle" | "working" | "done" }) {
  if (st === "done") {
    return (
      <span className="flex size-2 items-center justify-center">
        <span className="size-2 rounded-full bg-risk-low" />
      </span>
    );
  }
  return (
    <span className="relative flex size-2">
      {st === "working" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk-med opacity-70" />}
      <span className={`relative inline-flex size-2 rounded-full ${st === "working" ? "bg-risk-med" : "bg-line"}`} />
    </span>
  );
}
