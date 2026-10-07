import { AskDemo } from "./runout/AskDemo";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Heading } from "./ui/Heading";
import { SectionFrame } from "./ui/SectionFrame";

// What the agent reads, tied to the orders it affects. Illustrative examples for the marquee.
const signals = [
  { text: "Port strike reported in Santos", source: "News", tone: "bg-risk-high" },
  { text: "Heavy rain forecast, São Paulo", source: "Weather", tone: "bg-risk-med" },
  { text: "Second Class running 3.8 days late into LATAM", source: "Order history", tone: "bg-risk-med" },
  { text: "Customs backlog at Rotterdam", source: "News", tone: "bg-risk-med" },
  { text: "Typhoon warning, Manila", source: "Weather", tone: "bg-risk-high" },
  { text: "Standard Class on time across USCA", source: "Order history", tone: "bg-risk-low" },
  { text: "Rail strike called in Lagos", source: "News", tone: "bg-risk-high" },
  { text: "Peak season volumes up 18% in Europe", source: "Order history", tone: "bg-risk-med" },
];

const QUOTE = "“Most stockouts are visible weeks before they happen. RunOut is the one looking.”";

const edgeFade = "linear-gradient(to right, transparent, black 20%, black 80%, transparent)";

/** The role-by-role Ask demo, the signals the agent reads, and the closing quote. */
export function RolesAndSignals() {
  return (
    <>
      <section className="dark border-t border-subtle-stroke bg-primary-background text-primary-foreground">
        <div className="container max-lg:contents">
          <div className="border-x border-subtle-stroke max-lg:border-none">
            {/* One tab per role from the spec; the agent answers that role's question from its scope only. */}
            <AskDemo />

            <div className="relative overflow-hidden px-6 pt-22 pb-18 text-center md:px-14 md:pb-28 lg:pt-28 xl:pt-38" style={{ maskImage: edgeFade }}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[repeating-linear-gradient(to_right,rgb(255_255_255/0.035)_0_1px,transparent_1px_8px)]"
                style={{ maskImage: "radial-gradient(ellipse 55% 42% at 50% 38%, transparent 32%, #000 72%)" }}
              />
              <div className="flex flex-col items-center">
                <Badge>Signals</Badge>
                <Heading as="h3" className="mt-6 max-w-[696px] text-white-200" title="Evidence, not hunches." />
                <p className="mt-4 max-w-[464px] text-balance text-[16px] leading-5 font-medium tracking-[-0.16px] text-accent-foreground">
                  The agent reads the news, the weather and your own shipping history, and ties each finding to the orders it affects.
                </p>
                <Button href="#find-the-cause" variant="outline" size="xs" arrow className="mt-8">See an example</Button>
              </div>
              {/* Three identical sets so the CSS marquee (.logo-marquee) loops seamlessly. */}
              <div aria-hidden="true" className="-mx-6 mt-16 overflow-hidden md:-mx-14 md:mt-20 lg:mt-24">
                <ul className="logo-marquee -ml-3 flex items-center">
                  {[0, 1, 2].flatMap((copy) =>
                    signals.map(({ text, source, tone }) => (
                      <li key={`${copy}-${text}`} className="shrink-0 pl-3">
                        <span
                          className="flex items-center gap-3 rounded-2xl px-5 py-4 text-left"
                          style={{
                            backgroundImage: "linear-gradient(-30.12deg, rgb(28, 29, 31) 25.6%, rgb(46, 50, 56) 163%)",
                            boxShadow: "rgba(255, 255, 255, 0.1) 0.2px 0.2px 2px inset, rgba(0, 0, 0, 0.25) 0px 1.5px 1.5px",
                          }}
                        >
                          <span className={`size-2 shrink-0 rounded-full ${tone}`} />
                          <span className="text-[15px] font-medium whitespace-nowrap text-white-200">{text}</span>
                          <span className="text-[13px] whitespace-nowrap text-accent-foreground">{source}</span>
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-primary-background">
        <SectionFrame>
          <div className="relative flex min-h-[calc(100svh-var(--site-header-height))] flex-col items-center justify-center overflow-hidden px-[calc(100%/12)] py-40">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(var(--color-muted-strong-background)_1px,transparent_1px)] bg-size-[10px_10px] bg-position-[1px_1px]" />
            <figure className="relative flex flex-col items-center">
              <blockquote className="max-w-[18em] text-balance text-center text-heading-sm leading-9 font-normal tracking-[-0.015em] text-caption-foreground lg:text-[3rem] lg:leading-13">
                {QUOTE}
              </blockquote>
              <figcaption className="mt-9 text-center text-sm font-semibold text-secondary-foreground lg:mt-13">The RunOut team</figcaption>
            </figure>
          </div>
        </SectionFrame>
      </section>
    </>
  );
}
