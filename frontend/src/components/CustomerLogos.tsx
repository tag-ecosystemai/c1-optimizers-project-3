import { INTEGRATIONS, iconUrl } from "@/lib/integrations";
import { SectionFrame } from "./ui/SectionFrame";

const MOBILE_COUNT = 6;

export function CustomerLogos() {
  return (
    <section className="border-b border-subtle-stroke bg-secondary-background">
      <SectionFrame>
        <ul className="grid grid-cols-2 gap-px bg-subtle-stroke md:grid-cols-5 lg:border-x lg:border-subtle-stroke">
          {INTEGRATIONS.map(({ name, slug }, i) => {
            const mask = `url(${iconUrl(slug)})`;
            return (
              <li key={slug} className={`flex h-24 items-center justify-center gap-2.5 bg-secondary-background px-6 text-secondary-foreground ${i >= MOBILE_COUNT ? "max-md:hidden" : ""}`}>
                <span aria-hidden="true" className="block size-6 shrink-0 bg-current" style={{ maskImage: mask, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center" }} />
                <span className="truncate text-lg font-medium tracking-tight">{name}</span>
              </li>
            );
          })}
        </ul>
      </SectionFrame>
    </section>
  );
}
