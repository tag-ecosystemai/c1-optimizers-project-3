"use client";

import { useReducedMotion } from "motion/react";

/**
 * The hero's "6-Day Gap" story as a looping video (recorded from HeroStory, see docs/HERO_PLAN.md §4).
 * Visitors who prefer reduced motion get the poster: the final frame with the gap and the approved fix.
 */
export function HeroVideo({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const reduce = useReducedMotion();
  const base = `/videos/hero-story${variant === "mobile" ? "-mobile" : ""}`;
  return (
    <video
      className="block size-full object-cover"
      poster={`${base}-poster.jpg`}
      autoPlay={!reduce}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label="RunOut flags a 6-day stockout gap worth $12,000 and recommends a costed fix"
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
    </video>
  );
}
