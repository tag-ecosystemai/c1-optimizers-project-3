import { Divider } from "./Divider";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Heading } from "./ui/Heading";
import { SectionFrame } from "./ui/SectionFrame";

/** Intro to the four roles; the Ask demo follows in RolesAndSignals. */
export function Roles() {
  return (
    <section id="roles" className="relative isolate bg-secondary-background">
      <SectionFrame>
        <div className="h-32" />
      </SectionFrame>
      <Divider />
      <SectionFrame>
        <div className="grid grid-cols-24 pt-22 lg:pt-28 xl:pt-38">
          <div className="col-[3/-3] flex flex-col items-start gap-6 lg:col-[2/-2] xl:items-center xl:text-center">
            <Badge>Who it&apos;s for</Badge>
            <Heading
              className="max-w-[926px]"
              title="Everyone asks the same agent."
              accent="Ops, warehouses, distributors and your data team each get answers from their own slice of the data, and nothing outside it."
            />
            <Button href="#" variant="outline">Get started</Button>
          </div>
        </div>
        {/* Fine vertical rules fading in towards the next section. */}
        <div
          aria-hidden="true"
          className="h-[72px] w-full bg-[repeating-linear-gradient(90deg,#e6e7ead9_0_1px,transparent_1px_8px)] md:h-[112px]"
          style={{ maskImage: "linear-gradient(to bottom, transparent, #000)" }}
        />
      </SectionFrame>
    </section>
  );
}
