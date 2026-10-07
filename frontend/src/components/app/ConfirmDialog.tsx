"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const btn =
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-[10px] border px-3 text-sm transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Confirmation for Approve / Dismiss / Escalate, with an optional note. Native <dialog> opened with
 * showModal(): the page behind is inert (focus stays inside), Esc and a backdrop click call onCancel,
 * and focus returns to the button that opened it. Neither closes while `pending`. On open, focus lands on
 * the note field if there is one, else on Cancel (the safe choice).
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
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const cancel = () => {
    if (!pending) onCancel();
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      onClose={() => setNote("")}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && cancel()}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line-subtle bg-white p-0 text-fg shadow-xl backdrop:bg-black-200/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note.trim());
        }}
        className="flex flex-col gap-4 p-5"
      >
        <h2 id={`${id}-title`} className="text-lg text-fg">
          {title}
        </h2>
        {description && (
          <div id={`${id}-desc`} className="text-sm text-muted">
            {description}
          </div>
        )}
        {noteLabel && (
          <label className="flex flex-col gap-1.5 text-sm text-fg-2">
            <span>
              {noteLabel} {noteRequired ? <span className="text-muted">(required)</span> : <span className="text-muted">(optional)</span>}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              required={noteRequired}
              disabled={pending}
              className="resize-y rounded-[10px] border border-line p-2.5 text-sm text-fg focus-visible:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:opacity-60"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="flex gap-1.5 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-risk-high">
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={cancel} disabled={pending} className={`${btn} border-white-800 bg-white text-black-400 hover:bg-white-300`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || (noteRequired && !note.trim())}
            className={`${btn} text-white ${tone === "danger" ? "border-red-700 bg-risk-high hover:bg-red-700" : "border-black-600 bg-black-200 hover:bg-black-500"}`}
          >
            {pending ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
