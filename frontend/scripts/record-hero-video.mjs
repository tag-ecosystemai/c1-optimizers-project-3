// Records HeroAgentMap (src/components/runout/HeroAgentMap.tsx) to video in public/videos/, for slides and social.
// The site itself renders the live component; the videos are optional exports.
// Needs: the dev server on :3000 (`npm run dev`), Google Chrome, and ffmpeg on PATH.
// Usage: npm run video:hero
//
// How: /capture/hero-story renders the story with WAAPI disabled, so Motion follows Playwright's
// virtual clock; GSAP's timeline is scrubbed to each frame's exact time. 30 fps, 2x pixel density.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const FPS = 30;
const SECONDS = 14; // one full loop (HeroAgentMap LOOP)
const POSTER_AT = 12.9; // approved-fix moment
const variants = [
  { out: "hero-story", width: 1152, height: 620, query: "" },
  { out: "hero-story-mobile", width: 560, height: 470, query: "?compact" },
];
const root = path.resolve(import.meta.dirname, "..");
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });

mkdirSync(path.join(root, "public", "videos"), { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
for (const v of variants) {
  const frames = path.join(root, ".video-frames", v.out);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2 });
  await page.clock.install({ time: new Date("2026-10-01T09:00:00Z") });
  await page.goto(`http://localhost:3000/capture/hero-story${v.query}`, { waitUntil: "domcontentloaded" });
  while (!(await page.evaluate(() => !!window.__storyTimeline))) await page.clock.runFor(16);
  await page.clock.runFor(500); // let hydration and fonts settle

  for (let f = 0; f < FPS * SECONDS; f++) {
    await page.evaluate((t) => { window.__storyTimeline.time(t); }, f / FPS); // return nothing: the timeline object is huge
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, "0")}.png`) });
  }
  await page.close();

  const input = ["-framerate", String(FPS), "-i", path.join(frames, "f%04d.png")];
  const out = path.join(root, "public", "videos", v.out);
  ffmpeg(...input, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${out}.mp4`);
  ffmpeg(...input, "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", "-an", `${out}.webm`);
  ffmpeg("-i", path.join(frames, `f${String(Math.round(POSTER_AT * FPS)).padStart(4, "0")}.png`), "-q:v", "3", `${out}-poster.jpg`);
  console.log(`✓ ${v.out}`);
}
await browser.close();
