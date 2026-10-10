import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { DEMO_PASSWORD, users } from "@/mocks/users";
import { ROLE_LABEL } from "@/lib/auth/routes";
import { LoginForm, type DemoAccount } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · RunOut", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const demo: DemoAccount[] = users.map((u) => ({ email: u.email, name: u.display_name, role: ROLE_LABEL[u.role] }));

  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-signal/20 blur-3xl" />
      <div className="relative flex w-full max-w-md flex-col items-center gap-7">
        <Link href="/" aria-label="RunOut homepage" className="text-fg">
          <Logo className="h-8 w-auto" />
        </Link>
        <h1 className="text-center font-display text-3xl font-semibold leading-tight text-balance text-ink">
          Catch late shipments <br className="hidden sm:block" />
          before they <span className="text-brand">RunOut.</span>
        </h1>
        <div className="w-full rounded-2xl border border-line-subtle bg-white p-7 shadow-soft">
          <LoginForm next={typeof next === "string" ? next : undefined} demo={demo} demoPassword={DEMO_PASSWORD} />
        </div>
      </div>
    </main>
  );
}