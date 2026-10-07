"use client";

import { useActionState, useState } from "react";
import { signIn } from "@/lib/auth/actions";

export type DemoAccount = { email: string; name: string; role: string };

const field =
  "h-10 rounded-[10px] border border-line bg-white px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500";

/** Email + password form; in mock mode a demo-account picker fills it in. */
export function LoginForm({ next, demo, demoPassword }: { next?: string; demo: DemoAccount[] | null; demoPassword?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-3">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Email
          <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Password
          <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        </label>
        {state?.error && (
          <p role="alert" className="text-sm text-risk-high">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 h-10 cursor-pointer rounded-[10px] border border-black-600 bg-black-200 text-sm text-white-300 transition-colors hover:bg-black-500 hover:text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {demo && (
        <div className="flex flex-col gap-2 border-t border-line-faint pt-4">
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Demo accounts <span className="text-xs text-muted">Password for all: {demoPassword}</span>
            <select
              defaultValue=""
              onChange={(e) => {
                setEmail(e.target.value);
                setPassword(demoPassword ?? "");
              }}
              className={field}
            >
              <option value="" disabled>
                Pick an account to fill the form…
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
          </label>
        </div>
      )}
    </div>
  );
}
