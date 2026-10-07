"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";

/*
 * "Ask RunOut", one tab per role from docs/FRONTEND_SPEC.md §1. Each role asks its own question and the
 * agent answers from that role's scope only, the way /api/ask streams it (§8.2): tool-call chips, then
 * the answer token by token. Distributors never see dollar figures. Same example incident as the rest of
 * the page (#812, order #55123 to Brazil Consumer). Figures are illustrative.
 */
const roles = [
  {
    key: "ops",
    name: "Operations",
    scope: "Every market",
    who: "Ops manager",
    question: "What needs a decision right now, and what should I approve?",
    tools: ["Ranking open incidents by $ at risk", "Reading the agent's investigations"],
    answer:
      "Four incidents are open with $2,221 at risk. Start with #812: order #55123 to Brazil Consumer, 240 units short and $1,181 at risk, most likely because of a port strike at Santos (72% confidence). I recommend upgrading it to First Class for $340, which covers 190 of the 240 units.",
    actions: ["Approve First Class", "Open incident #812"],
    note: "Full access to every market.",
  },
  {
    key: "warehouse",
    name: "Warehouses",
    scope: "Own warehouse",
    who: "LATAM warehouse manager",
    question: "Which of my SKUs are running thin, and which distributors are affected?",
    tools: ["Reading LATAM inventory", "Matching open incidents to your distributors"],
    answer:
      "Two products are under two weeks of cover. Cardio equipment runs out on Mar 13 and hits Brazil Consumer, where order #55123 lands 5 days later, leaving 240 units short. Water sports has 9 days left and could hit Brazil Corporate if Friday's order slips. Everything else has more than 3 weeks.",
    actions: ["See inventory", "Acknowledge #812"],
    note: "I can only see the LATAM warehouse.",
  },
  {
    key: "distributor",
    name: "Distributors",
    scope: "Own account",
    who: "Brazil Consumer",
    question: "Will my order arrive on time? Will I run out?",
    tools: ["Checking your open orders", "Reading your stock"],
    answer:
      "Order #55123 is running about 7 days late and should now arrive on Mar 18. Your cardio equipment runs out on Mar 13, so you could be about 240 units short for five days. Your supplier has approved faster shipping, so this date may improve. I'll update you if it changes.",
    actions: ["Track order #55123", "See my stock"],
    note: "I can only see your account's data.",
  },
  {
    key: "data",
    name: "Data team",
    scope: "Every market + system",
    who: "Data engineer",
    question: "Are the models, data and agent healthy?",
    tools: ["Checking model runs", "Checking pipeline freshness", "Reading agent traces"],
    answer:
      "All green. The delay model's champion is gradient boosting, off by 1.1 days on average. Last night's pipeline finished at 06:00 and all four stages passed. The agent ran 37 investigations today with no errors, averaging 4.2 seconds each.",
    actions: ["Open model registry", "View agent traces"],
    note: "Includes system internals.",
  },
];

const ease = [0.33, 1, 0.68, 1] as const;
const WORDS_PER_SECOND = 22;
const HOLD_AFTER_ANSWER = 4500; // ms before moving to the next role

type Phase = { tools: number; words: number }; // tools finished, answer words shown

export function AskDemo() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const [phase, setPhase] = useState<Phase>({ tools: 0, words: 0 });
  const root = useRef<HTMLDivElement>(null);

  const role = roles[active];
  const words = role.answer.split(" ");
  const total = words.length;
  // Reduced motion: show the whole conversation at once.
  const shown: Phase = reduce ? { tools: role.tools.length, words: total } : phase;
  const done = shown.words >= total;

  const goTo = (i: number) => {
    setPhase({ tools: 0, words: 0 });
    setActive(i);
  };

  // Start playing only once the demo is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Play one conversation: tool calls finish one by one, then the answer streams in word by word.
  useEffect(() => {
    if (reduce || !inView) return;
    const timeouts = role.tools.map((_, i) =>
      setTimeout(() => setPhase((p) => ({ ...p, tools: Math.max(p.tools, i + 1) })), 900 + i * 800),
    );
    let stream: ReturnType<typeof setInterval> | undefined;
    timeouts.push(
      setTimeout(() => {
        stream = setInterval(() => setPhase((p) => (p.words >= total ? p : { ...p, words: p.words + 1 })), 1000 / WORDS_PER_SECOND);
      }, 900 + role.tools.length * 800 + 300),
    );
    return () => {
      timeouts.forEach(clearTimeout);
      clearInterval(stream);
    };
  }, [active, inView, reduce, role.tools, total]);

  // Move on to the next role after the answer, until someone picks a tab themselves.
  useEffect(() => {
    if (!auto || !done || reduce || !inView) return;
    const t = setTimeout(() => goTo((active + 1) % roles.length), HOLD_AFTER_ANSWER);
    return () => clearTimeout(t);
  }, [auto, done, reduce, inView, active]);

  const pick = (i: number) => {
    setAuto(false);
    if (i !== active) goTo(i);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root}>
        {/* Role tabs: who is asking, and what they can see. */}
        <div role="tablist" aria-label="Choose a role" className="grid grid-cols-2 lg:grid-cols-4">
          {roles.map((r, i) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={i === active}
              aria-controls="ask-demo-panel"
              onClick={() => pick(i)}
              className={`relative flex flex-col items-start gap-1 border-weak-stroke px-6 py-6 text-left transition-colors duration-300 not-first:border-l max-lg:nth-3:border-l-0 max-lg:nth-[n+3]:border-t lg:px-7 ${
                i === active ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
              }`}
            >
              {i === active && <motion.span layoutId="ask-role" className="absolute inset-x-0 top-0 h-0.5 bg-accent-stroke" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
              <span className={`text-[16px] font-medium ${i === active ? "text-white-200" : "text-accent-foreground"}`}>{r.name}</span>
              <span className="text-[13px] text-accent-foreground">{r.scope}</span>
            </button>
          ))}
        </div>

        {/* The conversation. */}
        <div className="border-t border-weak-stroke px-6 py-12 md:px-14 lg:py-16">
          <div
            id="ask-demo-panel"
            role="tabpanel"
            aria-live="polite"
            className="mx-auto flex min-h-[440px] max-w-[760px] flex-col rounded-2xl border border-weak-stroke bg-white/[0.03] md:min-h-[400px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-weak-stroke px-5 py-3 text-[13px]">
              <span className="shrink-0 font-medium text-white-200">Ask RunOut</span>
              <span className="truncate text-accent-foreground">Signed in as {role.who}</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={role.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease }}
                className="flex flex-1 flex-col gap-4 p-5"
              >
                <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-white/10 px-4 py-2.5 text-[15px] text-white-200">{role.question}</p>

                <ul className="flex flex-wrap gap-2">
                  {role.tools.map((t, i) => {
                    const finished = shown.tools > i;
                    const started = shown.tools >= i;
                    return started ? (
                      <motion.li
                        key={t}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 rounded-full border border-weak-stroke px-3 py-1 text-[12.5px] text-accent-foreground"
                      >
                        {finished ? (
                          <span className="text-risk-low">✓</span>
                        ) : (
                          <span className="size-3 animate-spin rounded-full border-[1.5px] border-accent-foreground border-t-transparent" />
                        )}
                        {t}
                      </motion.li>
                    ) : null;
                  })}
                </ul>

                {shown.words > 0 && (
                  <p className="text-[15px] leading-relaxed text-white-200">
                    {words.slice(0, shown.words).join(" ")}
                    {!done && <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-pulse bg-white-200/70" />}
                  </p>
                )}

                {done && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }} className="flex flex-wrap gap-2">
                    {role.actions.map((a, i) => (
                      <span key={a} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${i === 0 ? "bg-white-200 text-black-200" : "border border-weak-stroke text-white-200"}`}>
                        {a}
                      </span>
                    ))}
                  </motion.div>
                )}

                <div className="mt-auto flex flex-col gap-1 rounded-xl border border-weak-stroke px-4 py-3 text-[13px] text-accent-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span>Ask about your orders, stock or incidents…</span>
                  <span className="text-[12px] sm:shrink-0 sm:text-[13px]">{role.note}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
