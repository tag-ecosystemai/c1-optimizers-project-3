import type { ReactNode } from "react";
import { ChevronRight } from "./icons";

/** Announcement pill with a light travelling around its border (animation: .pill-beam in globals.css). */
export function Pill({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="group relative block rounded-[13px] border border-weak-stroke transition-colors duration-300 active:border-subtle-stroke">
      <span aria-hidden="true" className="absolute -inset-px">
        <span className="pill-beam block size-full rounded-[13px] bg-[conic-gradient(from_var(--angle)_at_50%_50%_in_oklch,#A3ECE900,#A3ECE9_20deg,#709FF5_100deg,#709FF500_120deg)]" />
      </span>
      <span className="relative flex items-center gap-x-1 rounded-[13px] bg-white-100 py-[5px] pr-[7px] pl-[11px] text-[13px]/[18px] font-medium text-secondary-foreground transition-colors duration-300 hover:bg-[#FBFBFC]">
        <span className="text-balance">{children}</span>
        <ChevronRight className="transition-transform duration-300 group-hover:translate-x-px" />
      </span>
    </a>
  );
}
