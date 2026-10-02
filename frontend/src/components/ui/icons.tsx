import type { ComponentProps } from "react";

/** 14px arrow used on links and buttons. */
export function ArrowRight(props: ComponentProps<"svg">) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" d="M2.25 7h9.5m0 0L8.357 3.5M11.75 7l-3.393 3.5" />
    </svg>
  );
}

/** 12px caret used on the announcement pill. */
export function ChevronRight(props: ComponentProps<"svg">) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M4.646 2.646a.5.5 0 0 0 0 .708L7.293 6 4.646 8.646a.5.5 0 1 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708 0Z" />
    </svg>
  );
}
