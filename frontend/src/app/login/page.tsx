import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { authMode } from "@/lib/data/core";
import { DEMO_PASSWORD, users } from "@/mocks/users";
import { ROLE_LABEL } from "@/lib/auth/routes";
import { LoginForm, type DemoAccount } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · RunOut", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const demo: DemoAccount[] | null =
    authMode() === "mock" ? users.map((u) => ({ email: u.email, name: u.display_name, role: ROLE_LABEL[u.role] })) : null;

  return (
    <main className="flex flex-1 items-center justify-center bg-secondary-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" aria-label="RunOut homepage" className="self-center text-fg">
          <Logo className="h-7 w-auto" />
        </Link>
        <div className="rounded-2xl border border-line-subtle bg-white p-6 shadow-soft">
          <h1 className="mb-1 text-2xl text-fg">Sign in</h1>
          <p className="mb-5 text-sm text-muted">Accounts are created by the RunOut team.</p>
          <LoginForm next={typeof next === "string" ? next : undefined} demo={demo} demoPassword={demo ? DEMO_PASSWORD : undefined} />
        </div>
      </div>
    </main>
  );
}
