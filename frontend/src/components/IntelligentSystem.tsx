// Landing page section: the five platform showcases, one article per PlatformNav tab.
import { PlatformNav } from "./PlatformNav";
import { Badge } from "./ui/Badge";
import { Heading } from "./ui/Heading";
import { SectionFrame } from "./ui/SectionFrame";
import { ShowcaseFrame, showcases } from "./runout/PlatformShowcases";

export function IntelligentSystem() {
  return (
    <section className="bg-secondary-background">
      <SectionFrame>
        <div className="relative grid grid-cols-24 border-b border-subtle-stroke pt-22 pb-16 lg:pt-28 lg:pb-18 xl:pt-38 xl:pb-20">
          <div className="col-[3/-3] flex flex-col items-start gap-6 lg:col-[2/-2]">
            <Badge>Platform</Badge>
            <Heading
              className="max-w-[896px]"
              title="The watchtower that never sleeps."
              accent="Spots the typhoon at 2am. Flags the late container before your supplier does. Tells you what it costs before you ask."
              accentOnNewLine
            />
          </div>
        </div>
        <div className="lg:grid lg:grid-cols-24">
          <PlatformNav />
          <div className="lg:col-[7/-1]">
            {showcases.map(({ id, title, line, crumb, Mockup }) => (
              <article key={id} id={id} className="scroll-mt-[calc(var(--site-header-height)+88px)]! border-b border-subtle-stroke last:border-b-0 lg:scroll-mt-(--site-header-height)!">
                <div className="px-[calc(100%/24)] pt-16 pb-11 lg:px-[calc(100%/18)] lg:pt-20 lg:pb-14 xl:pt-28 xl:pb-20">
                  <Heading as="h3" size="sm" className="max-w-[560px]" title={title} accent={line} />
                </div>
                <div aria-hidden="true" className="relative h-[327px] w-full overflow-hidden border-t border-subtle-stroke bg-surface-subtle select-none lg:h-[654px]">
                  <ShowcaseFrame crumb={crumb}>
                    <Mockup />
                  </ShowcaseFrame>
                </div>
              </article>
            ))}
          </div>
        </div>
      </SectionFrame>
    </section>
  );
}
