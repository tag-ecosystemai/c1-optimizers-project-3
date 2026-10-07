"use client";

import { useState, useTransition } from "react";
import { acknowledgeIncident } from "@/lib/data/actions";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

const btn =
  "inline-flex h-8 cursor-pointer items-center rounded-[10px] border border-white-800 bg-white px-2.5 text-xs text-black-400 hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-blue-500";

/** Warehouse "Acknowledge" for one incident: confirm, call the action, show the outcome inline. Shows "Acknowledged" when already done. */
export function AcknowledgeButton({ incidentId, orderId, acknowledged = false }: { incidentId: number; orderId: number; acknowledged?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = await acknowledgeIncident(incidentId);
      if (res.ok) {
        setDone(true);
        setOpen(false);
      } else setError(res.error);
    });

  return (
    <>
      {done || acknowledged ? (
        <span role="status" className="text-xs text-green-700">
          ✓ Acknowledged
        </span>
      ) : (
        <button
          type="button"
          className={btn}
          onClick={() => {
            setError(undefined);
            setOpen(true);
          }}
          aria-label={`Acknowledge incident #${incidentId}`}
        >
          Acknowledge
        </button>
      )}
      <ConfirmDialog
        open={open}
        title={`Acknowledge incident #${incidentId}?`}
        description={`This tells ops your warehouse has seen the risk on order #${orderId}. Ops still decides what to do.`}
        confirmLabel="Acknowledge"
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
