import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  /** Grey follow-on sentence after the title. */
  accent?: ReactNode;
  /** Put the accent on its own line from md up. */
  accentOnNewLine?: boolean;
  as?: "h2" | "h3";
  /** md: section heading (32px → 40px). sm: 24px sub-heading. */
  size?: keyof typeof sizes;
  className?: string;
};

const sizes = {
  md: "font-medium text-heading-responsive-md",
  sm: "font-display text-2xl leading-[1.15]",
} as const;

/** Heading pattern used across the page: a dark title followed by a grey sentence. */
export function Heading({ title, accent, accentOnNewLine, as: Tag = "h2", size = "md", className = "" }: Props) {
  return (
    <Tag className={`text-balance text-primary-foreground ${sizes[size]} ${className}`}>
      {title}
      {accent && (
        <>
          {" "}
          {accentOnNewLine && <br className="hidden md:block" />}
          <span className="text-accent-foreground">{accent}</span>
        </>
      )}
    </Tag>
  );
}
