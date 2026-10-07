"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Confirmation for Approve / Dismiss / Escalate, with an optional note. Native <dialog>: focus is trapped
 * and Esc closes (calls onCancel).
 * @param open         Show or hide.
 * @param title        e.g. "Approve First Class shipping?".
 * @param description  Extra context.
 * @param confirmLabel Confirm button text (default "Confirm").
 * @param tone         "danger" makes the confirm button red.
 * @param noteLabel    Shows a note field with this label.
 * @param noteRequired Disable confirm until the note has text.
 * @param pending      Disable both buttons while submitting.
 * @param error        Inline error (e.g. "Already decided by Marcus Lee").
 * @param onConfirm    Called with the note ("" if none).
 * @param onCancel     Called on Cancel or Esc.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "default",
  noteLabel,
  noteRequired,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  noteLabel?: string;
  noteRequired?: boolean;
  pending?: boolean;
  error?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line-subtle bg-white p-5 text-fg shadow-xl backdrop:bg-black/30"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note.trim());
        }}
        className="flex flex-col gap-4"
      >
        <h2 id="confirm-title" className="text-lg text-fg">
          {title}
        </h2>
        {description && <div className="text-sm text-muted">{description}</div>}
        {noteLabel && (
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            {noteLabel}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required={noteRequired} className="rounded-[10px] border border-line p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-blue-500" />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-risk-high">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="h-9 cursor-pointer rounded-[10px] border border-white-800 bg-white px-3 text-sm text-black-400 hover:bg-white-300 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || (noteRequired && !note.trim())}
            className={`h-9 cursor-pointer rounded-[10px] border px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 ${tone === "danger" ? "border-red-700 bg-risk-high hover:bg-red-700" : "border-black-600 bg-black-200 hover:bg-black-500"}`}
          >
            {pending ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
