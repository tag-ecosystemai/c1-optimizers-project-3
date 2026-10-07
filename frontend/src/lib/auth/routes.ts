// The one role/route table (spec §3.2), used by proxy.ts, the role layouts, the shell nav and
// scripts/check-routes.mjs. Keep it dependency-free: the check script imports this file directly.
import type { Role } from "../../types/api";

export type ViewAsKind = "warehouse" | "distributor";
export interface ViewAs {
  kind: ViewAsKind;
  id: number;
  name: string;
}

export const ROLE_HOME: Record<Role, string> = {
  ops: "/ops/watchtower",
  warehouse: "/warehouse/overview",
  distributor: "/my/overview",
  data: "/observability",
};

/** Path prefix each role may open. */
export const ROLE_PREFIX: Record<Role, string> = {
  ops: "/ops",
  warehouse: "/warehouse",
  distributor: "/my",
  data: "/observability",
};

export const ROLE_LABEL: Record<Role, string> = {
  ops: "Operations",
  warehouse: "Warehouse",
  distributor: "Distributor",
  data: "Data team",
};

export const NAV: Record<Role, { label: string; href: string }[]> = {
  ops: [
    { label: "Watchtower", href: "/ops/watchtower" },
    { label: "Network", href: "/ops/network" },
    { label: "History", href: "/ops/history" },
    { label: "Ask", href: "/ops/ask" },
  ],
  warehouse: [
    { label: "Overview", href: "/warehouse/overview" },
    { label: "Inventory", href: "/warehouse/inventory" },
    { label: "Incidents", href: "/warehouse/incidents" },
    { label: "Ask", href: "/warehouse/ask" },
  ],
  distributor: [
    { label: "Overview", href: "/my/overview" },
    { label: "Orders", href: "/my/orders" },
    { label: "Stock", href: "/my/stock" },
    { label: "Ask", href: "/my/ask" },
  ],
  data: [
    { label: "Hub", href: "/observability" },
    { label: "Models", href: "/observability/models" },
    { label: "Pipeline", href: "/observability/pipeline" },
    { label: "Agent", href: "/observability/agent" },
  ],
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** True for any path behind sign-in. */
export const isAppPath = (path: string) => Object.values(ROLE_PREFIX).some((p) => under(path, p));

/**
 * The role whose screens the user sees. Ops with View as on sees exactly what that
 * warehouse or distributor sees (and nothing under /ops until they exit).
 */
export function effectiveRole(role: Role, viewAs?: ViewAs | null): Role {
  return role === "ops" && viewAs ? viewAs.kind : role;
}

export const homeFor = (role: Role, viewAs?: ViewAs | null) => ROLE_HOME[effectiveRole(role, viewAs)];

export const canAccess = (path: string, role: Role, viewAs?: ViewAs | null) => under(path, ROLE_PREFIX[effectiveRole(role, viewAs)]);

/** A safe post-sign-in destination: the `next` path if this role may open it, otherwise its home. */
export function safeNext(next: string | null | undefined, role: Role, viewAs?: ViewAs | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return homeFor(role, viewAs);
  const path = next.split(/[?#]/)[0];
  return canAccess(path, role, viewAs) ? next : homeFor(role, viewAs);
}
