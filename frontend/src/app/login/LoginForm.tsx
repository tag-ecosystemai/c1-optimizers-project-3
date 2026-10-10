"use client";

import { useActionState, useState } from "react";
import { Lock, LogIn, Mail, Users } from "lucide-react";
import { signIn } from "@/lib/auth/actions";

export type DemoAccount = { email: string; name: string; role: string };

const field =
  "h-11 w-full rounded-[10px] border border-line bg-white pl-10 pr-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand";

/** Email + password form; in mock mode an account picker fills it in. */
export function LoginForm({ next, demo, demoPassword }: { next?: string; demo: DemoAccount[] | null; demoPassword?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col gap-5">
      {demo && (
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          <span className="font-medium text-fg">Select account to sign in</span>
          <span className="relative">
            <Users className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand" />
            <select
              defaultValue=""
              onChange={(e) => {
                setEmail(e.target.value);
                setPassword(demoPassword ?? "");
              }}
              className={`${field} cursor-pointer border-brand/40 bg-brand/5`}
            >
              <option value="" disabled>
                Select account…
              </option>
              {["Operations", "Data team", "Warehouse", "Distributor"].map((role) => (
                <optgroup key={role} label={role}>
                  {demo
                    .filter((a) => a.role === role)
                    .map((a) => (
                      <option key={a.email} value={a.email}>
                        {a.name} · {a.email}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </span>
        </label>
      )}

      <form action={action} className={`flex flex-col gap-3 ${demo ? "border-t border-line-faint pt-5" : ""}`}>
        {next && <input type="hidden" name="next" value={next} />}
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Email
          <span className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Password
          <span className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </span>
        </label>
        {state?.error && (
          <p role="alert" className="text-sm text-risk-high">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-brand text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <LogIn className="size-4" />
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}