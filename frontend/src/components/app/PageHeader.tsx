import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Title row at the top of every app page.
 * @param title       The page's h1.
 * @param description Grey sentence under the title.
 * @param eyebrow     Small row above the title (e.g. "Incident #812" plus a SeverityBadge).
 * @param actions     Buttons on the right (wrap under the title on phones).
 * @param back        Back link above everything, e.g. { href: "/ops/watchtower", label: "Watchtower" }.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="group -ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
          <span className="sr-only">Back to </span>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow && <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{eyebrow}</div>}
          <h1 className="font-display text-2xl text-balance text-fg md:text-[28px] md:leading-9">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-pretty text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
