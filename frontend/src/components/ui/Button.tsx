import type { ComponentProps } from "react";
import { ArrowRight } from "./icons";

const base =
  "group relative inline-flex cursor-pointer items-center justify-center gap-x-1.5 whitespace-nowrap border " +
  "transition-colors duration-300 ease-in-out hover:duration-75 active:duration-75 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

const sizes = {
  xs: "h-8 rounded-[10px] px-2.5 text-xs",
  sm: "h-9 rounded-[10px] px-3 text-sm",
  lg: "h-11.5 rounded-xl px-3.5 text-base",
} as const;

// Outline and ghost follow the surrounding `.dark` section automatically.
const variants = {
  primary: "border-black-600 bg-black-200 text-white-300 hover:bg-black-500 hover:text-white-100",
  outline:
    "border-white-800 bg-white-100 text-black-400 hover:bg-white-300 " +
    "dark:border-black-400 dark:bg-black-50 dark:text-white-400 dark:hover:bg-black-100",
  ghost: "border-transparent bg-transparent text-black-400 hover:bg-white-300 dark:text-white-400 dark:hover:bg-black-400",
} as const;

type Props = ComponentProps<"a"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Trailing arrow that nudges right on hover. */
  arrow?: boolean;
};

/** Link styled as a button (every CTA on the landing page is a link). */
export function Button({ variant = "primary", size = "sm", arrow, className = "", children, ...props }: Props) {
  return (
    <a className={`${base} ${sizes[size]} ${variants[variant]} ${arrow ? "pr-2" : ""} ${className}`} {...props}>
      {children}
      {arrow && <ArrowRight className="transition-transform duration-300 group-hover:translate-x-0.5" />}
    </a>
  );
}
