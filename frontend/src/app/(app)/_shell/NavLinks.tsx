"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Side nav on desktop, a scrollable tab strip on phones. Highlights the current section. */
export function NavLinks({ items, layout }: { items: { label: string; href: string }[]; layout: "column" | "row" }) {
  const pathname = usePathname();
  // The longest matching href wins, so "/observability" isn't active on "/observability/models".
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className={layout === "column" ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto"}>
      {items.map((i) => (
        <li key={i.href} className="shrink-0">
          <Link
            href={i.href}
            aria-current={i.href === active ? "page" : undefined}
            className={`block rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
              i.href === active ? "bg-surface text-fg" : "text-muted hover:bg-surface hover:text-fg"
            }`}
          >
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
