import type { ReactNode } from "react";

/**
 * Plain-language empty state for any data block.
 * @param title       Short headline, e.g. "No open incidents".
 * @param description One sentence on why it is empty or what to do.
 * @param action      Optional button or link.
 * @param icon        Optional icon above the title.
 */
export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <p className="text-base text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
