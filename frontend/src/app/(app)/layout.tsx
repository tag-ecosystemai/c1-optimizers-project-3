import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { requireSession } from "@/lib/auth/session";
import { effectiveRole, homeFor, NAV, ROLE_LABEL } from "@/lib/auth/routes";
import { exitViewAs, signOut, viewAs } from "@/lib/auth/actions";
import { authMode, getMe, getOpsNetwork } from "@/lib/data";
import { NavLinks } from "./_shell/NavLinks";

export const metadata: Metadata = {
  title: { template: "%s · RunOut", default: "RunOut" },
  robots: { index: false },
};

const smallBtn =
  "inline-flex h-8 cursor-pointer items-center rounded-[10px] border border-white-800 bg-white px-2.5 text-xs text-black-400 hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-blue-500";

/** Logged-in shell: header (logo, role, View as, sign out), side nav per role, View as banner. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const me = await getMe();
  const role = effectiveRole(session.role, session.viewAs);
  const network = session.role === "ops" ? await getOpsNetwork() : null;
  const nav = NAV[role];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line-subtle bg-white/95 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={homeFor(session.role, session.viewAs)} aria-label="RunOut home" className="shrink-0 text-fg">
              <Logo className="h-5 w-auto" />
            </Link>
            <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-fg-2">{ROLE_LABEL[session.role]}</span>
            {authMode() === "mock" && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200 ring-inset max-sm:hidden">Demo data</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {network && (
              <form action={viewAs} className="flex items-center gap-1.5 max-md:hidden">
                <label htmlFor="view-as" className="text-xs text-muted">
                  View as
                </label>
                <select
                  id="view-as"
                  name="target"
                  defaultValue={session.viewAs ? `${session.viewAs.kind}:${session.viewAs.id}` : ""}
                  className="h-8 max-w-48 rounded-[10px] border border-line bg-white px-2 text-xs text-fg"
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {network.map((n) => (
                    <optgroup key={n.warehouse.id} label={n.warehouse.market}>
                      <option value={`warehouse:${n.warehouse.id}`}>{n.warehouse.name}</option>
                      {n.distributors.map((d) => (
                        <option key={d.id} value={`distributor:${d.id}`}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button type="submit" className={smallBtn}>
                  Go
                </button>
              </form>
            )}
            <span className="truncate text-sm text-fg-2 max-sm:hidden">{me.display_name}</span>
            <form action={signOut}>
              <button type="submit" className={smallBtn}>
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Sections" className="border-t border-line-faint px-3 py-1.5 lg:hidden">
          <NavLinks items={nav} layout="row" />
        </nav>
      </header>

      {session.viewAs && (
        <div className="flex items-center justify-between gap-3 bg-blue-100 px-4 py-2 text-sm text-blue-600 lg:px-6" role="status">
          <span>
            Viewing as <strong className="font-medium">{session.viewAs.name}</strong>
            <span className="max-sm:hidden"> · you see exactly what they see</span>
          </span>
          <form action={exitViewAs}>
            <button type="submit" className={smallBtn}>
              Exit
            </button>
          </form>
        </div>
      )}

      <div className="flex flex-1">
        <aside className="w-52 shrink-0 border-r border-line-subtle p-3 max-lg:hidden">
          <nav aria-label="Sections" className="sticky top-17">
            <NavLinks items={nav} layout="column" />
          </nav>
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
