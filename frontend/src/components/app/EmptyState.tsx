import type { ReactNode } from "react";
import { Tray } from "@phosphor-icons/react/ssr";

/**
 * Plain-language empty state for any data block.
 * @param title       Short headline, e.g. "No open incidents".
 * @param description One sentence on why it is empty or what to do.
 * @param action      Optional button or link.
 * @param icon        Optional icon above the title (default: an empty tray).
 */
export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <div aria-hidden="true" className="mb-1 grid size-10 place-items-center rounded-full bg-surface text-muted">
        {icon ?? <Tray size={20} />}
      </div>
      <p className="text-base text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
