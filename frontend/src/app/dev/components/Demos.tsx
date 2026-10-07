"use client";

import { useState } from "react";
import type { RecommendedOption } from "@/types/api";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { ErrorState } from "@/components/app/ErrorState";
import { OptionCard } from "@/components/app/OptionCard";

const button =
  "h-9 cursor-pointer rounded-[10px] border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
const outline = `${button} border-white-800 bg-white text-black-400 hover:bg-white-300`;

/** OptionCards in a real form: arrow keys move, submit reads the radio value. */
export function OptionDemo({ options }: { options: RecommendedOption[] }) {
  const [selected, setSelected] = useState(options.find((o) => o.recommended)?.option_id ?? "");
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(String(new FormData(e.currentTarget).get("option") ?? ""));
      }}
      className="flex flex-col gap-3"
    >
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-2 text-sm text-muted">Pick a fix (controlled, inside a form)</legend>
        {options.map((o) => (
          <OptionCard key={o.option_id} option={o} selected={selected === o.option_id} onSelect={setSelected} />
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" className={`${button} border-black-600 bg-black-200 text-white hover:bg-black-500`}>
          Submit form
        </button>
        <p aria-live="polite" className="text-sm text-muted">
          {submitted !== null && `Form value: option=${submitted}`}
        </p>
      </div>
    </form>
  );
}

type Variant = "approve" | "dismiss" | "pending" | "error";

/** Every ConfirmDialog state. "Approve" fakes a 1.2 s save and then a 409. */
export function DialogDemo() {
  const [open, setOpen] = useState<Variant | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [log, setLog] = useState("");
  const close = () => {
    setOpen(null);
    setPending(false);
    setError(undefined);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={outline} onClick={() => setOpen("approve")}>
          Approve (saves, then 409)
        </button>
        <button type="button" className={outline} onClick={() => setOpen("dismiss")}>
          Dismiss (danger, note required)
        </button>
        <button
          type="button"
          className={outline}
          onClick={() => {
            setOpen("pending");
            setTimeout(close, 2500); // pending blocks Cancel and Esc, so the demo closes itself
          }}
        >
          Pending state (closes in 2.5 s)
        </button>
        <button type="button" className={outline} onClick={() => setOpen("error")}>
          Error state
        </button>
      </div>
      <p aria-live="polite" className="text-sm text-muted">
        {log}
      </p>

      <ConfirmDialog
        open={open === "approve"}
        title="Approve First Class shipping?"
        description="Re-ships 240 units by First Class for $340. Arrives in 4 days, before the stockout."
        confirmLabel="Approve"
        noteLabel="Note"
        pending={pending}
        error={error}
        onCancel={() => {
          close();
          setLog("Cancelled");
        }}
        onConfirm={(note) => {
          setPending(true);
          setTimeout(() => {
            setPending(false);
            setError("Already decided by Marcus Lee.");
            setLog(`Confirmed with note "${note}"`);
          }, 1200);
        }}
      />
      <ConfirmDialog
        open={open === "dismiss"}
        title="Dismiss incident #812?"
        description="The incident closes with no action. Say why so the team can learn from it."
        confirmLabel="Dismiss"
        tone="danger"
        noteLabel="Reason"
        noteRequired
        onCancel={() => {
          close();
          setLog("Cancelled");
        }}
        onConfirm={(note) => {
          close();
          setLog(`Dismissed: "${note}"`);
        }}
      />
      <ConfirmDialog open={open === "pending"} title="Escalate incident #812?" confirmLabel="Escalate" noteLabel="Note" pending onCancel={close} onConfirm={close} />
      <ConfirmDialog
        open={open === "error"}
        title="Approve First Class shipping?"
        confirmLabel="Approve"
        error="Already decided by Marcus Lee."
        onCancel={close}
        onConfirm={close}
      />
    </div>
  );
}

/** ErrorState with a client onRetry. */
export function ErrorRetryDemo() {
  const [tries, setTries] = useState(0);
  return <ErrorState title="Couldn't load incidents" message={tries ? `Still failing after ${tries} retries (this is a demo).` : "The server didn't answer. Check your connection and retry."} onRetry={() => setTries((t) => t + 1)} />;
}
