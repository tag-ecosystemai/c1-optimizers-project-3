import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { Divider } from "./Divider";
import { Hero } from "./Hero";
import { Pipeline } from "./Pipeline";
import { IntelligentSystem } from "./IntelligentSystem";
import { Roles } from "./Roles";
import { RolesAndSignals } from "./RolesAndSignals";

/** The landing page, composed from its sections. */
export function LandingPage() {
  return (
    <div className="font-sans text-base text-primary-foreground antialiased bg-(--color-page-background) [&_*[id]]:scroll-mt-[calc(var(--site-header-height)+24px)] [&_*[id]]:scroll-mb-6">
      <div className="flex min-h-screen max-w-screen flex-col justify-between overflow-x-clip">
        <Navbar />
        <main>
          <Hero />
          <Pipeline />
          <IntelligentSystem />
          <Divider />
          <Roles />
          <Divider />
          <RolesAndSignals />
        </main>
        <Footer />
      </div>
    </div>
  );
}
