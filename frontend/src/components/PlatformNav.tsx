"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { MotionConfig, motion } from "motion/react";
import { STEPS } from "./Pipeline";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Each nav item follows the <article id> it points at in IntelligentSystem (same list as the Pipeline strip).
const items = STEPS;

const spring = { type: "spring", stiffness: 420, damping: 38 } as const;

/** Sticky side nav (tabs on mobile) whose active item tracks the article in the middle of the viewport. */
export function PlatformNav() {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useGSAP(() => {
    const articles = items.map(({ id }) => document.getElementById(id)).filter((el) => el !== null);
    if (!articles.length) return;

    // Read live positions on every update instead of trusting ScrollTrigger's cached start/end:
    // fonts and images settle after hydration and shift the articles, which made cached positions stale.
    const update = () => {
      const middle = window.innerHeight / 2;
      let i = 0;
      articles.forEach((el, k) => {
        if (el.getBoundingClientRect().top <= middle) i = k;
      });
      if (i === activeRef.current) return;
      activeRef.current = i;
      setActive(i);
      // Keep the active mobile tab visible, scrolling only its own row (never the page).
      const tab = tabRefs.current[i];
      const row = tab?.closest<HTMLElement>(".overflow-x-auto");
      if (tab && row) {
        const t = tab.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        row.scrollTo({ left: row.scrollLeft + t.left - r.left - (r.width - t.width) / 2, behavior: "smooth" });
      }
    };

    ScrollTrigger.create({
      trigger: articles[0].parentElement, // the column holding all five articles
      start: "top bottom",
      end: "bottom top",
      onUpdate: update,
      onRefresh: update,
    });
    update();
  });

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label="Homepage platform showcases"
        className="sticky top-(--site-header-height) z-30 -mb-px border-subtle-stroke border-b bg-secondary-background max-lg:shadow-soft lg:col-[1/7] lg:mb-0 lg:grid lg:h-[calc(100vh-var(--site-header-height))] lg:grid-cols-subgrid lg:border-r lg:border-b-0 lg:pt-20 xl:pt-28"
      >
        {/* Mobile: horizontal tabs */}
        <div className="relative lg:hidden">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ol className="flex w-max min-w-full items-stretch gap-px bg-subtle-stroke">
              {items.map(({ id, label }, i) => (
                <li key={id} className="relative flex-1">
                  {i === active && (
                    <motion.span layoutId="platform-tab" transition={spring} aria-hidden="true" className="absolute inset-0 bg-surface-subtle" />
                  )}
                  <a
                    ref={(el) => { tabRefs.current[i] = el; }}
                    href={`#${id}`}
                    onClick={(e) => go(e, id)}
                    aria-current={i === active ? "location" : undefined}
                    className={`relative flex h-full items-center justify-center whitespace-nowrap px-5 py-4 text-sm transition-colors duration-200 ease-out ${
                      i === active ? "text-primary-foreground" : "bg-secondary-background text-tertiary-foreground hover:bg-white-300 hover:text-primary-foreground"
                    }`}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Desktop: vertical list with a sliding indicator */}
        <ol className="hidden lg:col-[2/-1] lg:flex lg:flex-col lg:gap-2">
          {items.map(({ id, label }, i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(e) => go(e, id)}
                aria-current={i === active ? "location" : undefined}
                className="group relative block py-1 pr-4 pl-7 font-medium text-[15px] leading-[1.2] md:pr-5 md:pl-8 lg:pl-0 lg:text-[18px]"
              >
                {i === active && (
                  <motion.span
                    layoutId="platform-indicator"
                    transition={spring}
                    aria-hidden="true"
                    className="absolute inset-y-0 -left-px w-0.5 bg-accent-stroke lg:-left-[calc(20%+1px)]"
                  />
                )}
                <span
                  className={`[--nav-idle:var(--color-disabled-foreground)] group-hover:[--nav-idle:var(--color-black-700)] [transition:color_320ms_var(--ease-out-cubic)] motion-reduce:[transition:none] ${
                    i === active ? "text-primary-foreground" : "text-[color:var(--nav-idle)]"
                  }`}
                >
                  {label}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </MotionConfig>
  );
}
