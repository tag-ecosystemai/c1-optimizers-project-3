import { HeroAgentMap } from "./runout/HeroAgentMap";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import { SectionFrame } from "./ui/SectionFrame";
import { WindowDots } from "./ui/WindowDots";

// Hero copy, shared by the desktop and mobile layouts. See docs/LANDING_V2.md.
const copy = {
  pill: "Four agents watching every order",
  headline: "Catch late orders before your distributors run out.",
  subhead: "AI agents spot late orders, find the cause and line up the fix.",
  secondary: { label: "See how it works", href: "#predict-late-orders" },
  primary: { label: "Get started", href: "#" },
};

const sky = "radial-gradient(90% 80% at 50% 100%, #e6ecff 0%, #bccbff 45%, #86a0ee 100%)";
const stripes = "bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--color-white-100)_78%,transparent)_0_1px,transparent_1px_8px)] opacity-40";

export function Hero() {
  return (
    <section className="border-b border-subtle-stroke bg-primary-background">
      {/* md and up: copy pinned under the header, the network map scrolls up over a blue sky. */}
      <div className="relative hidden grid-cols-1 grid-rows-1 md:grid">
        <div aria-hidden="true" className="pointer-events-none sticky top-(--site-header-height) col-start-1 row-start-1 h-[calc(100svh-var(--site-header-height))] self-start overflow-hidden">
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: sky }} />
          <div className={`absolute inset-0 ${stripes}`} />
          <div className="absolute top-0 left-[-150%] h-[150%] w-[400%] origin-top" style={{ backgroundImage: "radial-gradient(70% 106.6667% at 50% 0%, var(--color-primary-background) 32%, transparent 64%)" }} />
        </div>
        <div className="z-10 col-start-1 row-start-1 flex flex-col">
          <div className="hero-copy-fade sticky top-(--site-header-height) -mb-[min(calc(8px+20svh),calc(50svh-261px))] flex min-h-[clamp(320px,calc(40svh-var(--site-header-height)),520px)] flex-col items-center justify-center gap-6 px-14 pt-[max(96px,10svh)] text-center lg:mb-[max(min(calc(120px-20svh),calc(550px-53svh)),calc(max(389px,min(calc(82px+20vw),466px))-50svh))] lg:px-[58px]">
            <div className="flex flex-col items-center gap-9">
              <Pill href="#predict-late-orders">{copy.pill}</Pill>
              <h1
                className="max-w-[12em] text-balance font-display font-semibold leading-[0.95] text-primary-foreground" // two balanced lines, not one edge-to-edge line
                style={{ fontSize: "clamp(64px, 16px + 5.333svh, 80px)", letterSpacing: "clamp(-2.4px, 2.08px - 0.3733svh, -1.28px)" }}
              >
                {copy.headline}
              </h1>
            </div>
            <p className="mt-3 max-w-[27em] text-balance text-[18px] leading-[1.3] font-medium tracking-[-0.18px] text-accent-foreground">{copy.subhead}</p>
            <div className="mt-2 flex items-center justify-center gap-x-3">
              <Button href={copy.secondary.href} variant="outline" size="lg">{copy.secondary.label}</Button>
              <Button href={copy.primary.href} size="lg" arrow>{copy.primary.label}</Button>
            </div>
          </div>
          <div className="pointer-events-none sticky top-0 flex h-svh items-center justify-center pt-(--site-header-height) pb-20">
            <div className="relative w-2/3 max-w-[1440px] lg:w-3/4">
              <div aria-hidden="true" className="relative overflow-hidden rounded-lg bg-white-300/80 p-[3px] pt-0 backdrop-blur-md lg:rounded-2xl lg:p-1.5 lg:pt-0">
                <div className="flex h-4 items-center pl-1 lg:h-8 lg:pl-2">
                  <WindowDots className="gap-[3px] lg:gap-1.5" dot="size-1.5 lg:size-3" />
                </div>
                <div className="h-[380px] w-full overflow-hidden rounded-md bg-white-100 lg:h-[min(40.35vw,775px)] lg:rounded-xl lg:border lg:border-black-0/5">
                  <HeroAgentMap />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phones: stacked copy, then the compact agent view. */}
      <div className="relative overflow-hidden md:hidden">
        <SectionFrame className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden opacity-60" style={{ maskImage: "radial-gradient(280% 160% at 50% 0%, transparent 32%, #000 64%)" }}>
            <div className="absolute inset-0" style={{ backgroundImage: sky }} />
            <div className={`absolute inset-0 ${stripes}`} />
          </div>
          <div className="relative z-20 flex flex-col items-center gap-7 px-6 pt-16 text-center sm:gap-6 sm:pt-22">
            <Pill href="#predict-late-orders">{copy.pill}</Pill>
            <h1 className="text-balance text-heading-md leading-[0.95] text-primary-foreground sm:text-heading-lg sm:tracking-[-0.02em]">{copy.headline}</h1>
            <p className="max-w-[420px] text-balance text-[15px] leading-[1.3] font-medium tracking-[-0.17px] text-accent-foreground sm:text-[16px]">{copy.subhead}</p>
            <div className="flex w-full flex-col items-center gap-2">
              <Button href={copy.primary.href} size="lg" arrow className="w-full max-w-xs">{copy.primary.label}</Button>
              <Button href={copy.secondary.href} variant="ghost" arrow>{copy.secondary.label}</Button>
            </div>
          </div>
          <div aria-hidden="true" className="relative z-10 mt-10 mb-6 ml-4 overflow-hidden rounded-l-lg bg-white-300/80 pb-0.75 pl-0.75 shadow-[0_2px_8px_rgba(11,13,24,0.04),0_16px_40px_rgba(11,13,24,0.08)] backdrop-blur-md sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[560px] sm:rounded-lg sm:pr-0.75">
            <div className="flex h-4 items-center pl-1.5">
              <WindowDots className="gap-[3px]" dot="size-1.5" />
            </div>
            <div className="h-[296px] w-full overflow-hidden rounded-md bg-white-100">
              <HeroAgentMap compact />
            </div>
          </div>
        </SectionFrame>
      </div>
    </section>
  );
}
