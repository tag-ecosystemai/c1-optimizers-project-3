import type { ReactNode } from "react";

/** The bordered white card used for panels across the app. */
export const PANEL = "rounded-xl border border-line-subtle bg-white p-4";

/** A titled block: heading, optional description and actions, then content. */
export function Section({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-fg">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
