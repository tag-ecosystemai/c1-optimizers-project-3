"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { LoginResponse } from "@/types/api";
import { DEMO_PASSWORD, userByEmail } from "@/mocks/users";
import { getOpsNetwork } from "@/lib/data/ops";
import { authMode } from "@/lib/data/core";
import { clearSession, getSession, setSession, type Session } from "./session";
import { homeFor, safeNext, type ViewAs } from "./routes";

export type SignInState = { error?: string } | undefined;

const SignInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Enter your password." }),
});

const WRONG = "Email or password is incorrect.";

async function authenticate(email: string, password: string): Promise<Session | string> {
  if (authMode() === "mock") {
    const user = userByEmail(email);
    if (!user || password !== DEMO_PASSWORD) return WRONG;
    return {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      name: user.display_name,
      distributorId: user.distributor_id,
      warehouseId: user.warehouse_id,
      token: null,
      viewAs: null,
    };
  }
  let res: Response;
  try {
    res = await fetch(`${process.env.API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return "Can't reach the RunOut server. Try again in a moment.";
  }
  if (res.status === 401 || res.status === 422) return WRONG;
  if (!res.ok) return "Sign-in failed. Try again in a moment.";
  const { access_token, user } = (await res.json()) as LoginResponse;
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.display_name ?? user.email,
    distributorId: user.distributor_id ?? null,
    warehouseId: user.warehouse_id ?? null,
    token: access_token,
    viewAs: null,
  };
}

/** Sign-in form action (useActionState). Redirects to `next` (if allowed) or the role's home. */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (typeof result === "string") return { error: result };

  await setSession(result);
  redirect(safeNext(formData.get("next")?.toString(), result.role));
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}

/**
 * Ops only: view the app as a warehouse or distributor. Form field `target` = "warehouse:3" or "distributor:7".
 * The target is checked against the network, and the choice lives in the signed session.
 */
export async function viewAs(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ops") redirect(homeFor(session.role));

  const [kind, rawId] = String(formData.get("target") ?? "").split(":");
  const id = Number(rawId);
  const network = await getOpsNetwork();
  let target: ViewAs | undefined;
  if (kind === "warehouse") {
    const w = network.find((n) => n.warehouse.id === id);
    if (w) target = { kind, id, name: w.warehouse.name };
  } else if (kind === "distributor") {
    const d = network.flatMap((n) => n.distributors).find((x) => x.id === id);
    if (d) target = { kind, id, name: d.name };
  }
  if (!target) redirect(homeFor(session.role, session.viewAs));

  await setSession({ ...session, viewAs: target });
  revalidatePath("/", "layout");
  redirect(homeFor(session.role, target));
}

/** Leave View as and go back to the ops home. */
export async function exitViewAs() {
  const session = await getSession();
  if (!session) redirect("/login");
  await setSession({ ...session, viewAs: null });
  revalidatePath("/", "layout");
  redirect(homeFor(session.role));
}
