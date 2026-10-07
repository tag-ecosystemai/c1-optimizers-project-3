"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import type { IncidentStatus, RecommendedOption } from "@/types/api";
import { decideIncident } from "@/lib/data/actions";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { OptionCard } from "@/components/app/OptionCard";
import { StatusPill } from "@/components/app/StatusPill";

type Action = "approve" | "dismiss" | "escalate";

interface DecisionState {
  incidentId: number;
  status: IncidentStatus;
  options: RecommendedOption[];
  selected: string | null;
  setSelected: (id: string) => void;
  /** Set after a 403/409 or a successful decision: every button is locked. */
  locked: boolean;
  lock: () => void;
  setStatus: (s: IncidentStatus) => void;
}

const Ctx = createContext<DecisionState | null>(null);
const useDecision = () => useContext(Ctx)!;

/**
 * Shares the selected option between the option cards (mid-page) and the sticky decision bar (bottom).
 * Wrap the whole incident page so the bar sticks to the viewport bottom from the top of the page.
 */
export function DecisionProvider({ incidentId, status: initial, options, children }: { incidentId: number; status: IncidentStatus; options: RecommendedOption[]; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(options.find((o) => o.recommended)?.option_id ?? null);
  const [locked, setLocked] = useState(false);
  const [local, setStatus] = useState<IncidentStatus | null>(null);
  // The decision result shows at once, before the revalidated page arrives with the same status.
  const status = local ?? initial;
  return (
    <Ctx.Provider value={{ incidentId, status, options, selected, setSelected, locked, lock: () => setLocked(true), setStatus }}>
      <div className="flex flex-col">{children}</div>
    </Ctx.Provider>
  );
}

const canDo = (status: IncidentStatus, action: Action) => status === "open" || (status === "escalated" && action !== "escalate");

/** The 2–4 recommended options as radio cards. */
export function OptionPicker() {
  const { options, selected, setSelected, status, locked } = useDecision();
  const disabled = locked || !canDo(status, "approve");
  return (
    <div role="radiogroup" aria-label="Recommended options" className="grid gap-3 md:grid-cols-2">
      {options.map((o) => (
        <OptionCard key={o.option_id} option={o} selected={selected === o.option_id} onSelect={setSelected} disabled={disabled} />
      ))}
    </div>
  );
}

const btn = "inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none";
const primary = `${btn} bg-black-200 text-white hover:bg-black-400`;
const secondary = `${btn} border border-white-800 bg-white text-black-400 hover:bg-white-300`;

const copy: Record<Action, { title: string; confirm: string; note?: string }> = {
  approve: { title: "Approve this option?", confirm: "Approve" },
  dismiss: { title: "Dismiss this incident?", confirm: "Dismiss", note: "Why are you dismissing it?" },
  escalate: { title: "Escalate this incident?", confirm: "Escalate", note: "What should the escalation owner know?" },
};

/** Sticky Approve / Dismiss / Escalate bar with a confirm dialog. Handles 403 / 409 and locks after a decision. */
export function DecisionBar() {
  const { incidentId, status, options, selected, locked, lock, setStatus } = useDecision();
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, start] = useTransition();
  const option = options.find((o) => o.option_id === selected);

  const confirm = (note: string) =>
    start(async () => {
      if (!action) return;
      const res = await decideIncident(incidentId, { action, selectedOptionId: action === "approve" ? selected ?? undefined : undefined, note: note || undefined });
      if (res.ok) {
        setStatus(res.incident.status);
        lock();
        setMessage(action === "approve" && option ? `Approved: ${option.title}.` : `Incident ${res.incident.status}.`);
        setAction(null);
      } else if (res.status === 403 || res.status === 409) {
        // Someone else decided first, or this role can't decide: nothing more to do here.
        lock();
        setMessage(res.error);
        setAction(null);
      } else {
        setError(res.error);
      }
    });

  const open = (a: Action) => {
    setError(undefined);
    setAction(a);
  };
  const off = (a: Action) => locked || pending || !canDo(status, a);
  const c = action ? copy[action] : null;

  return (
    <>
      <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-line-subtle bg-white/95 px-4 py-3 backdrop-blur-md lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-2 text-sm" role="status" aria-live="polite">
            <StatusPill status={status} />
            <span className="truncate text-muted">
              {message ??
                (canDo(status, "approve") ? (option ? `Selected: ${option.title}` : "Select an option to approve") : "This incident has been decided.")}
            </span>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" className={secondary} disabled={off("escalate")} onClick={() => open("escalate")}>
              Escalate
            </button>
            <button type="button" className={secondary} disabled={off("dismiss")} onClick={() => open("dismiss")}>
              Dismiss
            </button>
            <button type="button" className={primary} disabled={off("approve") || !option} onClick={() => open("approve")}>
              Approve
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        key={action ?? "closed"}
        open={action !== null}
        title={c?.title ?? ""}
        description={action === "approve" && option ? option.title : undefined}
        confirmLabel={c?.confirm}
        tone={action === "dismiss" ? "danger" : "default"}
        noteLabel={c?.note}
        noteRequired={!!c?.note}
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setAction(null)}
      />
    </>
  );
}
