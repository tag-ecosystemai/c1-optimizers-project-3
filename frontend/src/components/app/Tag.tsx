import type { ReactNode } from "react";

const tones = {
  good: "bg-green-50 text-green-700 ring-green-200",
  bad: "bg-red-50 text-risk-high ring-red-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  info: "bg-blue-100 text-blue-600 ring-blue-200",
  neutral: "bg-surface text-muted ring-line-subtle",
};
const dots = { good: "bg-risk-low", bad: "bg-risk-high", warn: "bg-risk-med", info: "bg-blue-500", neutral: "bg-black-800" };

/** Status label: always text, colour only reinforces it. */
export type TagTone = keyof typeof tones;

export function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  );
}
