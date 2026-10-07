// Shared plumbing for the data functions: mode switch, scope from the session, and the FastAPI fetch.
import { redirect } from "next/navigation";
import type { Page, Role } from "@/types/api";
import { requireSession, type Session } from "@/lib/auth/session";
import { effectiveRole, homeFor } from "@/lib/auth/routes";

export const authMode = (): "mock" | "api" => (process.env.AUTH_MODE === "api" ? "api" : "mock");

/** Who the data is for. Ops with View as on is scoped exactly like the viewed warehouse or distributor. */
export interface Scope {
  session: Session;
  role: Role;
  distributorId: number | null;
  warehouseId: number | null;
}

export async function getScope(...allowed: Role[]): Promise<Scope> {
  const session = await requireSession();
  const role = effectiveRole(session.role, session.viewAs);
  if (allowed.length && !allowed.includes(role)) redirect(homeFor(session.role, session.viewAs));
  const v = session.role === "ops" ? session.viewAs : null;
  return {
    session,
    role,
    distributorId: v ? (v.kind === "distributor" ? v.id : null) : session.distributorId,
    warehouseId: v ? (v.kind === "warehouse" ? v.id : null) : session.warehouseId,
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined | null>;

/** Calls FastAPI with the session's bearer token. 401 → /login, 404 → null, other errors throw ApiError. */
export async function api<T>(scope: Scope, path: string, opts: { query?: Query; method?: string; body?: unknown; ignoreViewAs?: boolean } = {}): Promise<T | null> {
  const url = new URL(path, process.env.API_URL);
  // Ops viewing as someone asks the backend for that view (spec AUTH_APP_PLAN "Switching to the real backend").
  const v = scope.session.role === "ops" && !opts.ignoreViewAs ? scope.session.viewAs : null;
  const query: Query = { ...opts.query, ...(v && { [`${v.kind}_id`]: v.id }) };
  for (const [k, val] of Object.entries(query)) if (val !== undefined && val !== null && val !== "") url.searchParams.set(k, String(val));

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${scope.session.token}`, ...(opts.body !== undefined && { "Content-Type": "application/json" }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login");
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.json().then((b: { detail?: string }) => b.detail, () => undefined);
    throw new ApiError(res.status, detail ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Same as api() but a missing resource is an error (for list/summary endpoints). */
export async function apiOrThrow<T>(scope: Scope, path: string, opts?: Parameters<typeof api>[2]): Promise<T> {
  const data = await api<T>(scope, path, opts);
  if (data === null) throw new ApiError(404, `Not found: ${path}`);
  return data;
}

// Mock pagination: the cursor is the base64url offset.
const DEFAULT_LIMIT = 25;
const encode = (n: number) => Buffer.from(String(n)).toString("base64url");
const decode = (c?: string) => {
  const n = c ? Number(Buffer.from(c, "base64url").toString()) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export function paginate<T>(rows: T[], params: { limit?: number; cursor?: string }): Page<T> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), 100);
  const start = decode(params.cursor);
  const end = start + limit;
  return {
    items: rows.slice(start, end),
    next_cursor: end < rows.length ? encode(end) : null,
    prev_cursor: start > 0 ? encode(Math.max(start - limit, 0)) : null,
    total: rows.length,
  };
}

/** Sorts by a `field` / `-field` key. */
export function sortBy<T>(rows: T[], sort: string, get: (row: T, key: string) => string | number | undefined): T[] {
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const x = get(a, key) ?? 0;
    const y = get(b, key) ?? 0;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return desc ? -c : c;
  });
}

export const contains = (haystack: (string | number)[], q?: string) =>
  !q || haystack.some((h) => String(h).toLowerCase().includes(q.trim().toLowerCase()));
