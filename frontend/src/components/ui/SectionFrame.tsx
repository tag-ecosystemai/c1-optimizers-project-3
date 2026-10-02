import type { ReactNode } from "react";

/** The page column every section sits in: centred container with hairline side borders (borderless below lg). */
export function SectionFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="container flex flex-1 flex-col max-lg:contents">
      <div className={`flex w-full flex-1 flex-col border-x border-subtle-stroke max-lg:border-none ${className}`}>{children}</div>
    </div>
  );
}
