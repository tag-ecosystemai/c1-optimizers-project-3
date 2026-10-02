import type { ReactNode } from "react";

/** Small blue label above a section heading ("Platform", "Fast setup"…). */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex h-6 items-center rounded-lg bg-blue-100 px-1.5 text-[14px] leading-5 font-medium tracking-[-0.14px] text-blue-600 dark:bg-blue-800 dark:text-blue-200">
      {children}
    </p>
  );
}
