// Full-screen HeroStory for scripts/record-hero-video.mjs (npm run video:hero). Not linked anywhere.
import { HeroStory } from "@/components/runout/HeroStory";

export const metadata = { robots: { index: false } };

// Motion plays opacity/transform through WAAPI, which runs on real time and ignores the recorder's
// virtual clock. Removing it (before any app JS runs) makes Motion use its own rAF loop instead.
// __storyCapture tells HeroStory to hand its GSAP timeline to the recorder.
const NO_WAAPI = "delete Element.prototype.animate; window.__storyCapture = true;";

export default async function Capture({ searchParams }: PageProps<"/capture/hero-story">) {
  const compact = (await searchParams).compact !== undefined;
  return (
    <div className="fixed inset-0 bg-white">
      <script dangerouslySetInnerHTML={{ __html: NO_WAAPI }} />
      <style>{"nextjs-portal{display:none!important}"}</style>
      <HeroStory compact={compact} />
    </div>
  );
}
