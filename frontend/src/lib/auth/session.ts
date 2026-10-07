import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/types/api";
import { homeFor, ROLE_PREFIX, canAccess, type ViewAs } from "./routes";

export const SESSION_COOKIE = "session";
const MAX_AGE_S = 7 * 24 * 60 * 60;

/** What the signed session cookie carries. Scope (distributor/warehouse) always comes from here, never the client. */
export interface Session {
  userId: string;
  email: string;
  role: Role;
  name: string;
  distributorId: number | null;
  warehouseId: number | null;
  /** FastAPI bearer token (api mode); null in mock mode. */
  token: string | null;
  /** Ops only: the warehouse or distributor being viewed. */
  viewAs: ViewAs | null;
}

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set (see frontend/.env.example)");
  return new TextEncoder().encode(secret);
}

export async function encrypt(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(key());
}

/** Verifies the cookie value; undefined when missing, tampered with or expired. */
export async function decrypt(value: string | undefined): Promise<Session | undefined> {
  if (!value) return undefined;
  try {
    const { payload } = await jwtVerify<Session>(value, key(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    return undefined;
  }
}

/** Writes (or rewrites) the session cookie. Server Actions / Route Handlers only. */
export async function setSession(session: Session) {
  (await cookies()).set(SESSION_COOKIE, await encrypt(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user for this request (memoised per render), or undefined. */
export const getSession = cache(async (): Promise<Session | undefined> => decrypt((await cookies()).get(SESSION_COOKIE)?.value));

/** The session, or a redirect to /login. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Server gate for a role's area (the layouts call this; proxy.ts is only optimistic).
 * `requireRole("warehouse")` also admits ops while viewing as a warehouse.
 */
export async function requireRole(area: Role): Promise<Session> {
  const session = await requireSession();
  if (!canAccess(ROLE_PREFIX[area], session.role, session.viewAs)) redirect(homeFor(session.role, session.viewAs));
  return session;
}
