import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { ErrorState } from "@/components/app/ErrorState";

/** Runs a data function; returns null on failure so the block can show ErrorState. Next's redirects still go through. */
export async function load<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    console.error(err);
    return null;
  }
}

export const LoadError = ({ what }: { what: string }) => <ErrorState message={`We couldn't load ${what}. Try again in a moment.`} />;

/** A titled block on an observability page. */
export function Section({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-fg">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const tones = {
  good: "bg-green-50 text-green-700 ring-green-200",
  bad: "bg-red-50 text-risk-high ring-red-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  info: "bg-blue-100 text-blue-600 ring-blue-200",
  neutral: "bg-surface text-muted ring-line-subtle",
};
const dots = { good: "bg-risk-low", bad: "bg-risk-high", warn: "bg-risk-med", info: "bg-blue-500", neutral: "bg-black-800" };

/** Status label: always text, colour only reinforces it. */
export function Tag({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  );
}

const statusTone: Record<string, keyof typeof tones> = {
  ok: "good",
  connected: "good",
  champion: "good",
  active: "good",
  challenger: "info",
  running: "info",
  archived: "neutral",
  pending: "neutral",
  not_configured: "neutral",
  failed: "bad",
  error: "bad",
};

/** Tag for the API's status strings (`ok`, `not_configured`, `champion`…). */
export function StatusTag({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return <Tag tone={statusTone[status] ?? "neutral"}>{label.charAt(0).toUpperCase() + label.slice(1)}</Tag>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export const card = "rounded-xl border border-line-subtle bg-white p-4";
