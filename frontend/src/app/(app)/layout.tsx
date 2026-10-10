import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { requireSession } from "@/lib/auth/session";
import { effectiveRole, homeFor, NAV, ROLE_LABEL } from "@/lib/auth/routes";
import { exitViewAs, signOut, viewAs } from "@/lib/auth/actions";
import { authMode, getMe, getOpsNetwork } from "@/lib/data";
import { NavLinks } from "./_shell/NavLinks";
import { RefreshOnFocus } from "./_shell/RefreshOnFocus";

export const metadata: Metadata = {
  title: { template: "%s · RunOut", default: "RunOut" },
  robots: { index: false },
};

const smallBtn =
  "inline-flex h-8 cursor-pointer items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-fg-2 hover:bg-surface focus-visible:outline-2 focus-visible:outline-brand";

/** Logged-in shell: dark sidebar (logo, role, nav), a slim top bar (View as, user, sign out), the page on a light canvas. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const me = await getMe();
  const role = effectiveRole(session.role, session.viewAs);
  const network = session.role === "ops" ? await getOpsNetwork() : null;
  const nav = NAV[role];

  return (
    <div className="flex min-h-full flex-1 bg-canvas">
      <RefreshOnFocus />

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-ink text-white lg:flex">
        <div className="flex h-14 items-center px-5">
          <Link href={homeFor(session.role, session.viewAs)} aria-label="RunOut home" className="text-white">
            <Logo className="h-5 w-auto" />
          </Link>
        </div>
        <div className="px-5 pb-4">
          <span className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 text-xs text-white/80">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-signal" />
            {ROLE_LABEL[session.role]}
          </span>
        </div>
        <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 pb-6">
          <NavLinks items={nav} layout="column" />
        </nav>
        {authMode() === "mock" && <p className="px-5 pb-4 text-xs text-white/50">Demo data</p>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line-subtle bg-canvas/90 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <Link href={homeFor(session.role, session.viewAs)} aria-label="RunOut home" className="shrink-0 text-ink">
                <Logo className="h-5 w-auto" />
              </Link>
              <span className="rounded-md bg-ink px-2 py-0.5 text-xs text-white">{ROLE_LABEL[session.role]}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {network && (
                <form action={viewAs} className="flex items-center gap-1.5 max-md:hidden">
                  <label htmlFor="view-as" className="text-xs text-muted">
                    View as
                  </label>
                  <select
                    id="view-as"
                    name="target"
                    defaultValue={session.viewAs ? `${session.viewAs.kind}:${session.viewAs.id}` : ""}
                    className="h-8 max-w-48 rounded-lg border border-line bg-white px-2 text-xs text-fg"
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
              <span className="truncate text-sm font-medium text-fg-2 max-sm:hidden">{me.display_name}</span>
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
          <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 lg:px-8" role="status">
            <span>
              Viewing as <strong className="font-semibold">{session.viewAs.name}</strong>
              <span className="max-sm:hidden"> · you see exactly what they see</span>
            </span>
            <form action={exitViewAs}>
              <button type="submit" className={smallBtn}>
                Exit
              </button>
            </form>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}