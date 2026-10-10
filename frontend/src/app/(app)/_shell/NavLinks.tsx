"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Boxes,
  Database,
  History,
  Info,
  LayoutDashboard,
  MessageSquare,
  Network,
  Package,
  Radar,
  Warehouse,
  Truck,
  type LucideIcon,
} from "lucide-react";

/** Icon per nav label. Anything not listed simply shows no icon. */
const ICONS: Record<string, LucideIcon> = {
  Info,
  Watchtower: Radar,
  Network,
  History,
  Knowledge: BookOpen,
  Ask: MessageSquare,
  Hub: Database,
  Overview: LayoutDashboard,
  Orders: Package,
  Inventory: Boxes,
  Warehouse,
  Shipments: Truck,
};

/** Dark sidebar list on desktop (column), a light scrollable tab strip on phones (row). */
export function NavLinks({ items, layout }: { items: { label: string; href: string }[]; layout: "column" | "row" }) {
  const pathname = usePathname();
  // A single link is not a menu (e.g. the data role only has the Hub), so hide it.
  if (items.length < 2) return null;
  // The longest matching href wins, so a parent route isn't active on its child routes.
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const column = layout === "column";
  return (
    <ul className={column ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto"}>
      {items.map((i) => {
        const on = i.href === active;
        const Icon = ICONS[i.label];
        return (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={
                column
                  ? `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-signal ${
                      on ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`
                  : `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                      on ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-fg"
                    }`
              }
            >
              {column && on && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-signal" />}
              {Icon && <Icon aria-hidden="true" className={`size-4 shrink-0 ${column && on ? "text-signal" : ""}`} />}
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}